#!/usr/bin/env node
// Inline a PR analysis JSON into the singlefile report HTML.
//
// Marker contract — keep in sync with entrypoint.sh (artifact delivery step)
// and the report renderer's boot loader:
//   * The singlefile template (vite-plugin-singlefile build) ships with
//       <script type="application/json" id="underscore-report-data">__UNDERSCORE_REPORT_DATA__</script>
//   * This script replaces the __UNDERSCORE_REPORT_DATA__ token with the
//     serialized pr-output.json. Every '<' is escaped as \u003c (valid JSON,
//     identical after JSON.parse) so the payload can never contain a literal
//     '</script>' or '<!--' and terminate the script element.
//   * The report boot code reads the inline tag first; if its text is still
//     the raw marker (or the tag is absent — the multi-file Pages build), it
//     falls back to fetch('./pr-output.json').
import { readFileSync, writeFileSync } from 'node:fs';

const MARKER = '__UNDERSCORE_REPORT_DATA__';

const [template, jsonPath, outPath] = process.argv.slice(2);
if (!template || !jsonPath || !outPath) {
  console.error('usage: node inject-report-data.mjs <template.html> <pr-output.json> <out.html>');
  process.exit(1);
}

const html = readFileSync(template, 'utf8');
if (!html.includes(MARKER)) {
  console.error(`marker ${MARKER} not found in ${template} — is this the singlefile template?`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8')); // validate before inlining
const payload = JSON.stringify(data).replaceAll('<', '\\u003c');

writeFileSync(outPath, html.replace(MARKER, () => payload));
console.log(`${outPath}: inlined ${(payload.length / 1024 / 1024).toFixed(2)} MB of report data`);
