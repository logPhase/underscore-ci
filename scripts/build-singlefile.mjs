#!/usr/bin/env node
// Assemble the single-file report template from the MULTI-FILE build output.
//
// Replaces vite-plugin-singlefile: under rolldown-vite the plugin emitted a
// corrupted document — a ~1MB duplicated bundle tail appeared as a bare
// <script> and the module script itself was subtly damaged, so the same
// source behaved differently in the single-file report than in the
// multi-file one (the 2026-07 "orbit layout came back / groups vanished"
// bug). This assembler is dumb on purpose:
//   * every splice uses split/join — String.replace's `$`-pattern expansion
//     (the corruption class: a literal $` or $' inside minified JS expands
//     to a copy of the document) is structurally impossible;
//   * the ONLY content transforms are the two mandatory HTML-safety escapes
//     inside inlined code: `</script` → `\x3C/script` and `<!--` → `\x3C!--`
//     (valid only because those sequences can only occur inside JS string
//     literals, exactly as the plugin did);
//   * fonts and any other url() assets in CSS are inlined as data: URIs so
//     the artifact stays fully self-contained (file:// safe).
//
// Input : report-dist/            (pnpm build — the verified bundle)
// Output: report-dist-singlefile/index.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "report-dist");
const OUT_DIR = path.join(ROOT, "report-dist-singlefile");

const MIME = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

let html = readFileSync(path.join(DIST, "index.html"), "utf8");

// A raw NUL byte is legal in an external .js file but the HTML parser
// REWRITES it (U+0000 → U+FFFD) once the script is inlined — same bundle,
// different runtime strings, impossible-to-debug divergence (the 2026-07
// ordered-layout NUL-separator bug). NUL is the ONLY byte the tokenizer
// rewrites in script data; other C0 controls pass through, so only NUL is
// refused. Point at the offset so the offending literal is findable.
const guardControlBytes = (buf, name) => {
  const i = buf.indexOf(0x00);
  if (i !== -1)
    throw new Error(
      `${name} contains a raw NUL byte at offset ${i} — the HTML parser ` +
      "rewrites U+0000 to U+FFFD when inlined; use an escape sequence instead"
    );
};

const escInline = (code) =>
  code.split("</script").join("\\x3C/script").split("<!--").join("\\x3C!--");

// ── JS: <script type="module" ... src="./assets/x.js"></script> → inline ──
const scriptTags = [...html.matchAll(
  /<script[^>]*\bsrc="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g
)];
if (scriptTags.length !== 1)
  throw new Error(`expected exactly 1 module script, found ${scriptTags.length}`);
for (const m of scriptTags) {
  const jsBuf = readFileSync(path.join(DIST, m[1]));
  guardControlBytes(jsBuf, m[1]);
  const js = jsBuf.toString("utf8");
  html = html.split(m[0]).join(
    `<script type="module">${escInline(js.trim())}</script>`
  );
}

// ── CSS: inline stylesheets, with url(...) assets as data: URIs ──
const linkTags = [...html.matchAll(
  /<link[^>]*\bhref="\.\/(assets\/[^"]+\.css)"[^>]*>/g
)];
for (const m of linkTags) {
  let css = readFileSync(path.join(DIST, m[1]), "utf8");
  css = css.replace(/url\(([^)]+)\)/g, (whole, ref) => {
    const clean = ref.trim().replace(/^["']|["']$/g, "");
    if (/^(data:|https?:)/.test(clean)) return whole;
    const rel = clean.startsWith("./") ? `assets/${clean.slice(2)}`
      : clean.startsWith("assets/") ? clean
      : `assets/${clean}`;
    const ext = path.extname(rel).toLowerCase();
    const mime = MIME[ext];
    if (!mime) return whole;
    try {
      const b64 = readFileSync(path.join(DIST, rel)).toString("base64");
      return `url(data:${mime};base64,${b64})`;
    } catch {
      return whole; // asset missing — leave the reference, don't break the build
    }
  });
  html = html.split(m[0]).join(`<style>${css.trim()}</style>`);
}

// The injection marker tag must survive intact — the CI action swaps it for
// the analysis payload (inject-report-data.mjs).
if (!html.includes("__UNDERSCORE_REPORT_DATA__"))
  throw new Error("singlefile lost the __UNDERSCORE_REPORT_DATA__ marker tag");
// No external refs may remain — the artifact must work on file://.
const leftover = html.match(/(src|href)="\.\/assets\/[^"]+"/);
if (leftover) throw new Error(`external asset ref survived inlining: ${leftover[0]}`);
// Structural sanity: exactly two closing script tags may exist (the module
// bundle + the json data slot) — a third means something inside the inlined
// code still terminates a script element (the corruption class this script
// exists to prevent). And no `<!--` may sit inside the module content (it
// would flip the parser into script-data-escaped state).
const closes = html.split("</script>").length - 1;
if (closes !== 2)
  throw new Error(`expected exactly 2 </script> closers, found ${closes}`);
const modStart = html.indexOf('<script type="module">');
if (modStart < 0) throw new Error("module script missing from output");
const modContent = html.slice(
  modStart,
  html.indexOf("</script>", modStart)
);
if (modContent.includes("<!--"))
  throw new Error("unescaped <!-- inside the inlined bundle");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "index.html"), html);
console.log(
  `singlefile assembled: ${(html.length / 1024 / 1024).toFixed(2)} MB (from ${scriptTags.length} js + ${linkTags.length} css)`
);
