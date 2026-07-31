import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronsUpDown } from "lucide-react";
import ArchitectureCanvas from "@/components/architecture/ArchitectureCanvas";
import { Markdown } from "@/components/ui/Markdown";
import { splitSpecBlocks } from "@/lib/specs/ears";
import { latestByCapability, previousVersionOf, removedCapabilities } from "@/lib/specs/history";
import { removedRequirementCount, touchedRequirements, type ReqChange } from "@/lib/specs/req-diff";
import { relativeTime } from "@/lib/specs/relative-time";
import {
  buildActivity,
  classifyEars,
  groupPrs,
  heroStats,
  liveRequirementCount,
  prStateTabs,
  revisedThisWeek,
  weeklyCells,
} from "@/lib/repo/hub-data";
import {
  fetchViewerOverview,
  manifestOverview,
  portalEntry,
  repoEntries,
  resolveViewerLinks,
  type ViewerOverview,
} from "@/lib/repo/viewers";
import { useAnalysis } from "@/store/use-analysis-store";
import type { ArchNodeKind } from "@/types/architecture";
import type { SpecHistoryEvent } from "@/types/specs";

/**
 * RepoHub — the repository front page, per the founder's UX redesign
 * ("Front Page - Redesign"): sticky top bar (mark + repo switcher + section
 * nav), stat-strip hero, the arc42 building-block view (the REAL interactive
 * canvas inside the redesigned shell), living specifications (capability
 * activity grid + EARS requirement cards with revision badges + revisions
 * rail), and the pull-request index with search and an activity rail. Every
 * number is derived from the live manifest — no decorative data. Sections
 * degrade away when their payload is absent.
 */

// ── design tokens (from the redesign export) ─────────────────────────────
const T = {
  bg: "#090B12",
  panel: "#10131C",
  panel2: "#151926",
  line: "#1A2030",
  lineEm: "#232B3B",
  lineHi: "#2C3444",
  text: "#E9ECF4",
  muted: "#9AA3B5",
  dim: "#5F6879",
  cyan: "#7DD3FC",
  green: "#4ADE80",
  amber: "#FBBF24",
  rose: "#F87171",
  violet: "#C4B5FD",
  sans: "'Space Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  serif: "var(--reading-font, Georgia, serif)",
};

const OP_COLOR: Record<string, string> = {
  created: T.green,
  updated: T.cyan,
  modified: T.cyan,
  deleted: T.rose,
};

const STATE_DOT: Record<string, string> = {
  open: T.green,
  merged: T.violet,
  closed: T.rose,
};

const KIND_COLOR: Partial<Record<ArchNodeKind, string>> = {
  component: "#8b9fe8",
  service: "#5ec6d6",
  datastore: "#63d9a6",
  topic: "#c39ae0",
  external: "#9aa7c7",
};

function shortRepo(repo: string): string {
  return (repo.split("/").pop() || repo).replace(/\.git$/, "");
}

function capTitle(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const mono = (size: number, color: string): React.CSSProperties => ({
  fontFamily: T.mono, fontSize: size, color,
});

export default function RepoHub() {
  const manifest = useAnalysis((s) => s.repoManifest);
  const architecture = useAnalysis((s) => s.transformedData?.architecture);
  const specs = useAnalysis((s) => s.transformedData?.specs);
  const repoViewers = useAnalysis((s) => s.repoViewers);
  const now = useMemo(() => Date.now(), []);

  const allLinks = useMemo(
    () => resolveViewerLinks(repoViewers, window.location.pathname),
    [repoViewers],
  );
  const repos = useMemo(() => repoEntries(allLinks), [allLinks]);
  const portal = useMemo(() => portalEntry(allLinks), [allLinks]);

  const prs = useMemo(() => manifest?.prs ?? [], [manifest]);
  const stats = useMemo(
    () => heroStats(architecture, specs, prs),
    [architecture, specs, prs],
  );

  // specs derivations
  const history = useMemo(() => specs?.history ?? [], [specs]);
  const latest = useMemo(() => latestByCapability(history), [history]);
  const orderedSpecs = useMemo(
    () =>
      [...(specs?.specs ?? [])].sort((a, b) =>
        (latest.get(b.capability)?.at ?? "").localeCompare(
          latest.get(a.capability)?.at ?? "",
        ),
      ),
    [specs, latest],
  );
  const superseded = useMemo(
    () => removedCapabilities(history, (specs?.specs ?? []).map((s) => s.capability)),
    [history, specs],
  );
  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const activeCap = selectedCap ?? orderedSpecs[0]?.capability ?? null;
  const activeSpec = orderedSpecs.find((s) => s.capability === activeCap) ?? null;

  /** Diff of the active capability's latest revision (best-effort — needs the
   *  previous version's content in the baked bundle). */
  const activeDiff = useMemo(() => {
    if (!activeSpec) return { touched: new Map<number, ReqChange>(), removed: 0 };
    const last = latest.get(activeSpec.capability);
    const prevEvent = last ? previousVersionOf(history, last.version_id) : null;
    const prevContent = prevEvent
      ? (specs?.versions?.[prevEvent.version_id]?.content ?? null)
      : null;
    return {
      touched: touchedRequirements(prevContent, activeSpec.content ?? ""),
      removed: removedRequirementCount(prevContent, activeSpec.content ?? ""),
    };
  }, [activeSpec, latest, history, specs]);

  const [prQuery, setPrQuery] = useState("");
  const [prState, setPrState] = useState<string | null>(null);
  const stateTabs = useMemo(() => prStateTabs(prs), [prs]);
  const prGroups = useMemo(
    () => groupPrs(prs, prQuery, now, prState),
    [prs, prQuery, now, prState],
  );
  const activity = useMemo(() => buildActivity(prs, history, 10), [prs, history]);

  if (!manifest) return null;
  const name = shortRepo(manifest.repo).toUpperCase();

  return (
    <div
      className="h-screen w-screen overflow-y-auto"
      style={{ background: T.bg, color: T.text, fontFamily: T.sans }}
    >
      <TopBar name={name} repos={repos} portalHref={portal?.href}
              hasArch={!!architecture} hasSpecs={!!specs} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${T.line}`, background: "#0B0E17" }}>
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-end gap-8 px-8 pt-10 pb-8">
          <div className="min-w-[280px] flex-1">
            <p style={{ ...mono(10.5, T.dim), letterSpacing: "0.18em",
                        textTransform: "uppercase" }}>
              Repository · {manifest.repo}
            </p>
            <h1 className="mt-2 text-[38px] leading-none font-bold"
                style={{ letterSpacing: "-0.02em" }}>
              {name}
            </h1>
            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed"
               style={{ fontFamily: T.serif, color: T.muted }}>
              The system's architecture and living specifications, with every
              pull request traced end to end.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-10 pb-1">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[26px] font-semibold leading-none">{s.value}</div>
                <div className="mt-1.5"
                     style={{ ...mono(9.5, T.dim), letterSpacing: "0.14em",
                              textTransform: "uppercase" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Architecture — arc42 building-block view ─────────────────── */}
      {architecture && architecture.nodes.length > 0 && (
        <ArchSection architecture={architecture} name={name}
                     weekNote={weekNote(prs, history, now)} />
      )}

      <div className="mx-auto max-w-[1240px] px-8">
        {/* ── Living specifications ──────────────────────────────────── */}
        {specs && orderedSpecs.length > 0 && (
          <section className="mt-14">
            <h2 className="text-[20px] font-semibold">Living specifications</h2>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <p className="max-w-lg text-[13.5px] leading-relaxed"
                 style={{ fontFamily: T.serif, color: T.muted }}>
                The behaviour this system guarantees, written as EARS
                requirements and revised by the analyzer whenever the code
                moves.
              </p>
              <Link to="/specs" className="group ml-auto flex items-center gap-1.5"
                    style={mono(11.5, T.cyan)}>
                Open specs
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
              <Stat n={orderedSpecs.length} label="capabilities" />
              <Stat n={liveRequirementCount(specs)} label="live requirements" />
              <Stat n={revisedThisWeek(history, now)} label="revised this week"
                    color={T.cyan} />
              {superseded.length > 0 && (
                <Stat n={superseded.length} label="superseded" color={T.rose} />
              )}
            </div>

            {/* capability grid */}
            <div className="mt-5 overflow-hidden rounded-xl border"
                 style={{ borderColor: T.line, background: T.panel }}>
              {orderedSpecs.map((sp) => {
                const last = latest.get(sp.capability);
                const cells = weeklyCells(
                  history.filter((e) => e.capability === sp.capability), 13, now);
                const reqCount = splitSpecBlocks(sp.content)
                  .filter((b) => b.kind === "req").length;
                const active = sp.capability === activeCap;
                return (
                  <button
                    key={sp.capability}
                    type="button"
                    onClick={() => setSelectedCap(sp.capability)}
                    className="flex w-full cursor-pointer items-center gap-4 border-b px-4 py-2.5 text-left transition-colors"
                    style={{
                      borderColor: T.line,
                      background: active ? T.panel2 : "transparent",
                    }}
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: last
                            ? (OP_COLOR[last.operation] ?? T.dim) : T.lineEm }} />
                    <span className="min-w-0 w-[220px] shrink-0">
                      <span className="block truncate text-[13px] font-medium">
                        {capTitle(sp.capability)}
                      </span>
                      {last && (
                        <span style={mono(10, T.dim)}>
                          {last.operation === "deleted" ? "superseded" : last.operation}{" "}
                          {relativeTime(last.at)}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-1 items-center gap-[5px]">
                      {cells.map((c, i) => (
                        <span key={i} aria-hidden
                              className="h-[11px] w-[11px] rounded-[3px]"
                              style={{
                                background: c.op
                                  ? `color-mix(in srgb, ${OP_COLOR[c.op] ?? T.cyan} 28%, ${T.panel})`
                                  : T.panel2,
                                border: `1px solid ${c.op
                                  ? (OP_COLOR[c.op] ?? T.cyan) : T.line}`,
                              }} />
                      ))}
                    </span>
                    <span className="shrink-0" style={mono(11, T.muted)}>
                      {reqCount} req
                    </span>
                  </button>
                );
              })}
              {superseded.map((e) => (
                <div key={e.version_id}
                     className="flex w-full items-center gap-4 px-4 py-2.5"
                     style={{ opacity: 0.6 }}>
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: T.rose }} />
                  <span className="text-[13px] line-through" style={{ color: T.dim }}>
                    {capTitle(e.capability)}
                  </span>
                  <span style={mono(10, T.rose)}>superseded {relativeTime(e.at)}</span>
                </div>
              ))}
            </div>

            {/* selected capability — requirirement cards + revisions rail */}
            {activeSpec && (
              <CapabilityDetail
                capability={activeSpec.capability}
                content={activeSpec.content ?? ""}
                last={latest.get(activeSpec.capability)}
                touched={activeDiff.touched}
                removed={activeDiff.removed}
                events={history.filter((e) => e.capability === activeSpec.capability)}
              />
            )}
          </section>
        )}

        {/* ── Pull requests + activity ───────────────────────────────── */}
        <section className="mt-14 pb-24">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[20px] font-semibold">Pull requests</h2>
            <span style={mono(11, T.dim)}>
              {prs.length} analyzed · newest first
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-10 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  value={prQuery}
                  onChange={(e) => setPrQuery(e.target.value)}
                  placeholder="Search pull requests…"
                  className="min-w-[220px] flex-1 rounded-lg border px-3.5 py-2 outline-none"
                  style={{ ...mono(12.5, T.text), background: T.panel,
                           borderColor: T.lineEm }}
                />
                {stateTabs.map((t) => (
                  <button key={t.label} type="button"
                          onClick={() => setPrState(t.state)}
                          className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors"
                          style={{
                            borderColor: prState === t.state ? T.lineHi : T.lineEm,
                            background: prState === t.state ? T.panel2 : "transparent",
                            ...mono(10.5, prState === t.state ? T.text : T.dim),
                          }}>
                    {t.state && (
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full"
                            style={{ background: STATE_DOT[t.state] ?? T.dim }} />
                    )}
                    {t.label}
                    <span style={{ color: T.dim }}>{t.count}</span>
                  </button>
                ))}
              </div>
              {prGroups.length === 0 && (
                <p className="mt-6 text-center" style={mono(12, T.dim)}>
                  No pull requests match.
                </p>
              )}
              {prGroups.map((g) => (
                <div key={g.label} className="mt-5">
                  <p style={{ ...mono(10, T.dim), letterSpacing: "0.16em",
                              textTransform: "uppercase" }}>
                    {g.label}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {g.prs.map((pr, i) => (
                      <li key={pr.url || i}>
                        <a href={pr.url}
                           className="group flex items-center gap-3.5 rounded-lg border px-4 py-2.5 transition-colors hover:border-[#2C3444]"
                           style={{ borderColor: T.line, background: T.panel }}>
                          {pr.state && (
                            <span aria-hidden title={pr.state}
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: STATE_DOT[pr.state] ?? T.dim }} />
                          )}
                          {pr.number != null && (
                            <span className="shrink-0 tabular-nums"
                                  style={mono(11.5, T.dim)}>
                              #{pr.number}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium">
                              {pr.title}
                            </span>
                            {pr.summary && (
                              <span className="block truncate text-[12px]"
                                    style={{ fontFamily: T.serif, color: T.muted }}>
                                {pr.summary}
                              </span>
                            )}
                          </span>
                          {pr.journeys != null && pr.journeys > 0 && (
                            <span className="shrink-0" style={mono(10.5, T.dim)}>
                              {pr.journeys} journey{pr.journeys === 1 ? "" : "s"}
                            </span>
                          )}
                          {pr.author && (
                            <span className="hidden shrink-0 sm:block"
                                  style={mono(10.5, T.dim)}>
                              {pr.author}
                            </span>
                          )}
                          {pr.updatedAt && (
                            <span className="shrink-0" style={mono(10.5, T.dim)}>
                              {relativeTime(pr.updatedAt)}
                            </span>
                          )}
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-60"
                                      style={{ color: T.cyan }} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {activity.length > 0 && (
              <aside className="w-full shrink-0 lg:w-[280px]">
                <h3 className="text-[14px] font-semibold">Activity</h3>
                <ul className="mt-3 flex flex-col gap-3.5 border-l pl-4"
                    style={{ borderColor: T.line }}>
                  {activity.map((a, i) => (
                    <li key={i}>
                      <p style={{ ...mono(9.5,
                          a.kind === "specification" ? T.cyan : T.green),
                          letterSpacing: "0.14em", textTransform: "uppercase" }}>
                        {a.kind}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px]"
                         style={{ color: T.muted }}>
                        {a.text}
                      </p>
                      <p style={mono(10, T.dim)}>{relativeTime(a.at)}</p>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </section>
      </div>

      <footer className="mx-auto max-w-[1240px] border-t px-8 py-6"
              style={{ borderColor: T.line, ...mono(11, T.dim) }}>
        Generated by Underscore
        {manifest.generatedAt && ` · ${relativeTime(manifest.generatedAt)}`}
      </footer>
    </div>
  );
}

// ── top bar ──────────────────────────────────────────────────────────────

function TopBar({ name, repos, portalHref, hasArch, hasSpecs }: {
  name: string;
  repos: { name: string; href: string; active: boolean }[];
  portalHref?: string;
  hasArch: boolean;
  hasSpecs: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-md"
            style={{ background: "rgba(9,11,18,0.86)", borderColor: T.line }}>
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-5 px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[22px] w-[22px] items-end justify-center rounded-md border"
                style={{ background: T.panel2, borderColor: T.lineHi,
                         ...mono(13, T.cyan), fontWeight: 600 }}>
            <span style={{ transform: "translateY(-4px)" }}>_</span>
          </span>
          <span style={{ ...mono(11, T.dim), letterSpacing: "0.18em",
                         textTransform: "uppercase" }}>
            Underscore
          </span>
        </div>
        <div className="h-5 w-px" style={{ background: T.lineEm }} />
        {/* repo switcher */}
        <div className="relative">
          <button type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border py-1 pr-2.5 pl-2"
                  style={{ borderColor: T.lineEm, background: T.panel,
                           color: T.text }}>
            <span className="text-[13px] font-semibold">{name}</span>
            {repos.length > 1 && (
              <ChevronsUpDown className="h-3 w-3" style={{ color: T.dim }} />
            )}
          </button>
          {open && repos.length > 1 && (
            <div className="absolute top-9 left-0 z-50 w-56 overflow-hidden rounded-lg border shadow-xl"
                 style={{ borderColor: T.lineEm, background: T.panel }}>
              {repos.map((r) =>
                r.active ? (
                  <div key={r.href} className="flex items-center px-3 py-2"
                       style={{ background: T.panel2 }}>
                    <span className="text-[12.5px] font-semibold">{r.name}</span>
                    <span className="ml-auto" style={mono(9, T.dim)}>VIEWING</span>
                  </div>
                ) : (
                  <a key={r.href} href={r.href}
                     className="block px-3 py-2 text-[12.5px] transition-colors hover:bg-[#151926]"
                     style={{ color: T.text }}>
                    {r.name}
                  </a>
                ),
              )}
              {portalHref && (
                <a href={portalHref}
                   className="block border-t px-3 py-2 transition-colors hover:bg-[#151926]"
                   style={{ borderColor: T.line, ...mono(11, T.cyan) }}>
                  All repositories →
                </a>
              )}
            </div>
          )}
        </div>
        <nav className="ml-auto flex items-center gap-1">
          {hasArch && <NavItem to="/architecture" label="Architecture" />}
          {hasSpecs && <NavItem to="/specs" label="Specs" />}
        </nav>
      </div>
    </header>
  );
}

const NavItem = ({ to, label }: { to: string; label: string }) => (
  <Link to={to}
        className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[#151926]"
        style={mono(11.5, T.muted)}>
    {label}
  </Link>
);

// ── architecture section ─────────────────────────────────────────────────

function weekNote(prs: { updatedAt?: string }[],
                  history: SpecHistoryEvent[], now: number): string | null {
  const week = 7 * 24 * 60 * 60 * 1000;
  const p = prs.filter((x) => x.updatedAt &&
    now - Date.parse(x.updatedAt) < week).length;
  const s = revisedThisWeek(history, now);
  if (p === 0 && s === 0) return null;
  const parts = [
    p > 0 && `${p} pull request${p === 1 ? "" : "s"}`,
    s > 0 && `${s} spec revision${s === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return `${parts.join(" · ")} this week`;
}

function ArchSection({ architecture, name, weekNote }: {
  architecture: NonNullable<ReturnType<() => import("@/types/architecture").ArchitecturePayload>>;
  name: string;
  weekNote: string | null;
}) {
  const [level, setLevel] = useState<"context" | "container">("container");
  const container = useMemo(() => {
    const cn = architecture.nodes.filter(
      (n) => n.kind !== "person" && n.kind !== "system");
    const ids = new Set(cn.map((n) => n.id));
    return {
      nodes: cn,
      edges: architecture.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    };
  }, [architecture]);
  const hasContext = useMemo(
    () => architecture.nodes.some((n) => n.kind === "person" || n.kind === "system"),
    [architecture],
  );
  const legend = useMemo(() => {
    const kinds = new Set(architecture.nodes.map((n) => n.kind));
    return (Object.entries(KIND_COLOR) as [ArchNodeKind, string][])
      .filter(([k]) => kinds.has(k));
  }, [architecture]);

  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="mx-auto max-w-[1240px] px-8">
        <div className="flex flex-wrap items-center gap-4 py-3">
          <span style={{ ...mono(10.5, T.dim), letterSpacing: "0.16em",
                         textTransform: "uppercase" }}>
            arc42 §5 · Building block view
          </span>
          {hasContext && (
            <div className="flex overflow-hidden rounded-lg border"
                 style={{ borderColor: T.lineEm }}>
              {([["container", "Level 1 · Building blocks"],
                 ["context", "Context · Neighbours"]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setLevel(k)}
                        className="cursor-pointer px-3 py-1.5 transition-colors"
                        style={{ ...mono(10.5, level === k ? T.text : T.dim),
                                 background: level === k ? T.panel2 : "transparent" }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <span className="ml-auto" />
          {weekNote && (
            <span className="rounded-full border px-3 py-1"
                  style={{ borderColor: T.lineEm, ...mono(10.5, T.amber) }}>
              ● {weekNote}
            </span>
          )}
          <Link to="/architecture"
                className="group flex items-center gap-1.5 rounded-lg border px-3 py-1.5"
                style={{ borderColor: T.lineEm, ...mono(11, T.cyan) }}>
            Open full architecture
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
      <div style={{ height: 520, background: "#0A0D15",
                    borderTop: `1px solid ${T.line}` }}>
        <ArchitectureCanvas
          nodes={level === "container" ? container.nodes : architecture.nodes}
          edges={level === "container" ? container.edges : architecture.edges}
          layers={architecture.layers}
          storageKey={`${name}:hub:${level}`}
        />
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-4 px-8 py-2.5">
        {legend.map(([kind, color]) => (
          <span key={kind} className="flex items-center gap-1.5"
                style={{ ...mono(9.5, T.dim), letterSpacing: "0.1em",
                         textTransform: "uppercase" }}>
            <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
            {kind === "datastore" ? "data store" : kind}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── specs helpers ────────────────────────────────────────────────────────

const Stat = ({ n, label, color }: { n: number; label: string; color?: string }) => (
  <span className="flex items-baseline gap-1.5">
    <span className="text-[17px] font-semibold"
          style={{ color: color ?? T.text }}>{n}</span>
    <span style={{ ...mono(9.5, T.dim), letterSpacing: "0.12em",
                   textTransform: "uppercase" }}>{label}</span>
  </span>
);

const KIND_LABEL: Record<string, string> = {
  "ubiquitous": "ubiquitous",
  "event-driven": "event-driven",
  "state-driven": "state-driven",
  "unwanted behaviour": "unwanted behaviour",
  "optional feature": "optional feature",
};

function CapabilityDetail({ capability, content, last, touched, removed, events }: {
  capability: string;
  content: string;
  last: SpecHistoryEvent | undefined;
  touched: Map<number, ReqChange>;
  removed: number;
  events: SpecHistoryEvent[];
}) {
  const reqs = useMemo(
    () => splitSpecBlocks(content).filter((b) => b.kind === "req"),
    [content],
  );
  const SHOWN = 8;
  const changedCount = [...touched.values()].filter((c) => c === "changed").length;
  const newCount = [...touched.values()].filter((c) => c === "new").length;
  const summary = [
    changedCount && `${changedCount} revised`,
    newCount && `${newCount} added`,
    removed && `${removed} removed`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="mt-8 flex flex-col gap-10 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[16px] font-semibold">{capTitle(capability)}</h3>
          {last && (
            <span className="rounded-full border px-2.5 py-0.5"
                  style={{ borderColor: T.lineEm,
                           ...mono(10, OP_COLOR[last.operation] ?? T.dim) }}>
              {last.operation === "deleted" ? "superseded" : last.operation}{" "}
              {relativeTime(last.at)}
            </span>
          )}
        </div>
        {summary && (
          <p className="mt-1" style={mono(11, T.amber)}>
            {summary} in this revision
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2.5">
          {reqs.slice(0, SHOWN).map((b) => {
            const change = touched.get(b.reqNo);
            const edge = change === "new" ? T.green
              : change === "changed" ? T.amber : T.line;
            return (
              <div key={b.reqNo} className="rounded-lg border py-2.5 pr-4 pl-3.5"
                   style={{ borderColor: T.line, background: T.panel,
                            borderLeft: `3px solid ${edge}` }}>
                <div className="flex items-center gap-2.5">
                  <span className="rounded px-1.5 py-0.5"
                        style={{ background: T.bg, ...mono(10, T.cyan) }}>
                    REQ-{b.reqNo}
                  </span>
                  <span style={{ ...mono(9, T.dim), letterSpacing: "0.14em",
                                 textTransform: "uppercase" }}>
                    {KIND_LABEL[classifyEars(b.text)]}
                  </span>
                  {change && (
                    <span className="ml-auto"
                          style={{ ...mono(9.5,
                            change === "new" ? T.green : T.amber),
                            letterSpacing: "0.12em",
                            textTransform: "uppercase" }}>
                      {change === "new" ? "new" : "revised"}
                    </span>
                  )}
                </div>
                {b.title && (
                  <div className="mt-1.5 text-[13px] font-semibold">
                    {b.title}
                  </div>
                )}
                <div className="mt-1.5 text-[13px] leading-relaxed"
                     style={{ color: b.title ? T.muted : T.text }}>
                  <Markdown text={b.text} />
                </div>
              </div>
            );
          })}
        </div>
        {reqs.length > SHOWN && (
          <p className="mt-3" style={mono(11, T.dim)}>
            {reqs.length - SHOWN} further requirement
            {reqs.length - SHOWN === 1 ? "" : "s"} —{" "}
            <Link to="/specs" style={{ color: T.cyan }}>open the full spec →</Link>
          </p>
        )}
      </div>
      {events.length > 0 && (
        <aside className="w-full shrink-0 lg:w-[260px]">
          <h4 className="text-[13.5px] font-semibold">Revisions</h4>
          <ul className="mt-3 flex flex-col gap-3 border-l pl-4"
              style={{ borderColor: T.line }}>
            {events.slice(0, 8).map((e, i) => (
              <li key={e.version_id || String(i)}>
                <p style={{ ...mono(9.5, OP_COLOR[e.operation] ?? T.dim),
                            letterSpacing: "0.14em",
                            textTransform: "uppercase" }}>
                  {e.operation === "deleted" ? "superseded" : e.operation}
                </p>
                <p style={mono(10.5, T.dim)}>{relativeTime(e.at)}</p>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

// ── RepoCard — shared with the Level-0 portal page ───────────────────────

/** One integrated repo's overview card (unchanged — the portal renders these;
 *  the hub's own cross-repo affordance is the top-bar switcher now). */
export function RepoCard({
  name,
  href,
  active,
  overview,
}: {
  name: string;
  href: string;
  active: boolean;
  overview: ViewerOverview | null;
}) {
  const meta = overview
    ? ([
        `${overview.components} components`,
        `${overview.capabilities} capabilities`,
        `${overview.prs} pull request${overview.prs === 1 ? "" : "s"}`,
        overview.generatedAt && `updated ${relativeTime(overview.generatedAt)}`,
      ].filter(Boolean) as string[])
    : [];

  const body = (
    <>
      <div className="flex items-center gap-3">
        <span
          className="text-[19px] font-semibold"
          style={{
            fontFamily: "var(--bpmn-font-display)",
            color: "var(--bpmn-text)",
            letterSpacing: "-0.01em",
          }}
        >
          {name}
        </span>
        {active ? (
          <span
            className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider uppercase"
            style={{
              color: "var(--bpmn-text-dim)",
              border: "1px solid var(--bpmn-border-soft)",
            }}
          >
            Viewing
          </span>
        ) : (
          <ArrowRight
            className="ml-auto h-4 w-4 shrink-0 opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-80"
            style={{ color: "var(--bpmn-cyan)" }}
          />
        )}
      </div>
      {overview && (
        <>
          <p
            className="mt-1 font-mono text-[11px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            {overview.repo}
          </p>
          <p
            className="mt-3 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11.5px]"
            style={{ color: "var(--bpmn-text-muted)" }}
          >
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden style={{ opacity: 0.45 }}>·</span>}
                {m}
              </span>
            ))}
          </p>
          {overview.latestPr && (
            <p
              className="mt-2 line-clamp-1 text-[12.5px]"
              style={{
                fontFamily: "var(--reading-font)",
                color: "var(--bpmn-text-muted)",
              }}
              title={overview.latestPr.title}
            >
              {overview.latestPr.number != null && (
                <span
                  className="mr-1.5 font-mono text-[11px]"
                  style={{ color: "var(--bpmn-text-dim)" }}
                >
                  #{overview.latestPr.number}
                </span>
              )}
              {overview.latestPr.title}
            </p>
          )}
        </>
      )}
      {!overview && !active && (
        <p
          className="mt-2 font-mono text-[11px]"
          style={{ color: "var(--bpmn-text-dim)" }}
        >
          Open to see its architecture, specs and pull requests.
        </p>
      )}
    </>
  );

  const cardStyle: React.CSSProperties = {
    borderColor: active ? "var(--bpmn-border-em)" : "var(--bpmn-border-soft)",
    background: "var(--bpmn-surface-soft)",
  };

  if (active) {
    return (
      <div className="rounded-xl border px-5 py-4" style={cardStyle}>
        {body}
      </div>
    );
  }
  return (
    <a
      href={href}
      className="group block rounded-xl border px-5 py-4 transition-colors hover:border-[var(--bpmn-border-em)]"
      style={cardStyle}
      title={`Open ${name}`}
    >
      {body}
    </a>
  );
}

// re-exports kept for the portal page's imports
export { fetchViewerOverview, manifestOverview };
