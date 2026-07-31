import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  fetchViewerOverview,
  repoEntries,
  resolveViewerLinks,
  type ViewerOverview,
} from "@/lib/repo/viewers";
import { relativeTime } from "@/lib/specs/relative-time";
import { useAnalysis } from "@/store/use-analysis-store";

/**
 * RepoPortal — Level 0, the single entry page for the whole platform, in the
 * founder's front-page design language (same tokens as the repo hub): sticky
 * top bar, display hero, one live overview card per repository → click into
 * its hub (architecture, specifications, pull requests).
 */

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
  sans: "'Space Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  serif: "var(--reading-font, Georgia, serif)",
};

const mono = (size: number, color: string): React.CSSProperties => ({
  fontFamily: T.mono, fontSize: size, color,
});

export default function RepoPortal() {
  const repoViewers = useAnalysis((s) => s.repoViewers);
  const repos = useMemo(
    () =>
      repoEntries(resolveViewerLinks(repoViewers, window.location.pathname)),
    [repoViewers],
  );
  const [overviews, setOverviews] = useState<
    Record<string, ViewerOverview | null>
  >({});
  useEffect(() => {
    let cancelled = false;
    for (const v of repos) {
      if (overviews[v.href] !== undefined) continue;
      void fetchViewerOverview(v.href).then((ov) => {
        if (!cancelled) setOverviews((prev) => ({ ...prev, [v.href]: ov }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  const totals = useMemo(() => {
    const loaded = repos
      .map((r) => overviews[r.href])
      .filter((o): o is ViewerOverview => !!o);
    return {
      repos: repos.length,
      capabilities: loaded.reduce((n, o) => n + o.capabilities, 0),
      prs: loaded.reduce((n, o) => n + o.prs, 0),
    };
  }, [repos, overviews]);

  return (
    <div className="h-screen w-screen overflow-y-auto"
         style={{ background: T.bg, color: T.text, fontFamily: T.sans }}>
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-md"
              style={{ background: "rgba(9,11,18,0.86)", borderColor: T.line }}>
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-2.5 px-8">
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
      </header>

      {/* hero */}
      <div style={{ borderBottom: `1px solid ${T.line}`, background: "#0B0E17" }}>
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-end gap-8 px-8 pt-10 pb-8">
          <div className="min-w-[280px] flex-1">
            <p style={{ ...mono(10.5, T.dim), letterSpacing: "0.18em",
                        textTransform: "uppercase" }}>
              Platform
            </p>
            <h1 className="mt-2 text-[38px] leading-none font-bold"
                style={{ letterSpacing: "-0.02em" }}>
              Repositories
            </h1>
            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed"
               style={{ fontFamily: T.serif, color: T.muted }}>
              Every system Underscore watches. Open one for its architecture,
              living specifications, and every analyzed pull request.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-10 pb-1">
            {[
              { value: totals.repos, label: "repositories" },
              { value: totals.capabilities, label: "capabilities" },
              { value: totals.prs, label: "pull requests" },
            ].filter((s) => s.value > 0).map((s) => (
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

      {/* repo cards */}
      <div className="mx-auto max-w-[1240px] px-8 pt-10 pb-24">
        <div className="flex flex-col gap-3">
          {repos.map((v) => {
            const o = overviews[v.href] ?? null;
            const meta = o
              ? ([
                  o.components > 0 && `${o.components} components`,
                  o.capabilities > 0 && `${o.capabilities} capabilities`,
                  `${o.prs} pull request${o.prs === 1 ? "" : "s"}`,
                  o.generatedAt && `updated ${relativeTime(o.generatedAt)}`,
                ].filter(Boolean) as string[])
              : [];
            return (
              <a key={v.href} href={v.href}
                 className="group flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-6 py-5 transition-colors hover:border-[#2C3444]"
                 style={{ borderColor: T.line, background: T.panel }}>
                <div className="min-w-[220px]">
                  <div className="text-[20px] font-bold"
                       style={{ letterSpacing: "-0.01em" }}>
                    {v.name}
                  </div>
                  {o && (
                    <div className="mt-0.5" style={mono(10.5, T.dim)}>
                      {o.repo}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
                     style={mono(11.5, T.muted)}>
                  {meta.map((m, i) => (
                    <span key={m} className="flex items-center gap-2.5">
                      {i > 0 && <span aria-hidden style={{ opacity: 0.4 }}>·</span>}
                      {m}
                    </span>
                  ))}
                  {!o && (
                    <span style={mono(11, T.dim)}>
                      open to see its architecture, specs and pull requests
                    </span>
                  )}
                </div>
                <span className="ml-auto flex items-center gap-2"
                      style={mono(11.5, T.cyan)}>
                  {o?.latestPr && (
                    <span className="hidden max-w-[320px] truncate lg:block"
                          style={{ fontFamily: T.serif, color: T.muted,
                                   fontSize: 12.5 }}>
                      {o.latestPr.number != null && (
                        <span style={{ ...mono(11, T.dim), marginRight: 6 }}>
                          #{o.latestPr.number}
                        </span>
                      )}
                      {o.latestPr.title}
                    </span>
                  )}
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            );
          })}
        </div>
        {repos.length === 0 && (
          <p className="rounded-xl border px-4 py-8 text-center"
             style={{ borderColor: T.line, ...mono(12, T.dim) }}>
            No repositories are registered on this host yet.
          </p>
        )}

        <footer className="mt-16 border-t pt-6"
                style={{ borderColor: T.line, ...mono(11, T.dim) }}>
          Generated by Underscore
        </footer>
      </div>
    </div>
  );
}
