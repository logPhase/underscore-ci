import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, GitPullRequest, Network, Route, ScrollText } from "lucide-react";
import ArchitectureCanvas from "@/components/architecture/ArchitectureCanvas";
import { latestByCapability } from "@/lib/specs/history";
import { relativeTime } from "@/lib/specs/relative-time";
import { resolveViewerLinks } from "@/lib/repo/viewers";
import { useAnalysis } from "@/store/use-analysis-store";
import type { RepoManifestPr } from "@/types/repo-manifest";
import type { SpecHistoryEvent } from "@/types/specs";

/**
 * RepoHub — the repository's HOME. Where a per-PR report opens onto one
 * pull request, the hub opens onto the whole repo: the GLOBAL system
 * architecture as the anchor (container first), the living specifications
 * beneath it, and every analyzed pull request indexed below. Rendered at '/'
 * when a repo-manifest.json is served (see EntryLoader / boot()).
 *
 * Design: restraint over decoration. One accent (cyan), a strong display
 * hierarchy (Space Grotesk) with mono for metadata, wide vertical rhythm, and
 * a single quiet entrance. The global artifacts are shown here AND reachable
 * full-screen via the shell routes — the hub feeds those same pages.
 */

function shortRepo(repo: string): string {
  const tail = repo.split("/").pop() || repo;
  return tail.replace(/\.git$/, "");
}

/** "license-plate-identifier" -> "License plate identifier". */
function capabilityTitle(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const OP_DOT: Record<string, string> = {
  created: "#10b981",
  updated: "#38bdf8",
  modified: "#38bdf8",
  deleted: "#f87171",
};

const STATE_META: Record<string, { dot: string; label: string }> = {
  merged: { dot: "#a78bfa", label: "merged" },
  open: { dot: "#10b981", label: "open" },
  closed: { dot: "#f87171", label: "closed" },
};

export default function RepoHub() {
  const manifest = useAnalysis((s) => s.repoManifest);
  const architecture = useAnalysis((s) => s.transformedData?.architecture);
  const specs = useAnalysis((s) => s.transformedData?.specs);
  const repoViewers = useAnalysis((s) => s.repoViewers);

  // Sibling repos on this host (viewers.json) — the repo switcher. Only
  // rendered when the host actually serves more than one repo.
  const viewerLinks = useMemo(
    () => resolveViewerLinks(repoViewers, window.location.pathname),
    [repoViewers],
  );

  const prs = useMemo(() => {
    const list = manifest?.prs ?? [];
    return [...list].sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  }, [manifest]);

  const latest = useMemo(
    () => latestByCapability(specs?.history ?? []),
    [specs],
  );
  const capabilities = useMemo(() => {
    const items = specs?.specs ?? [];
    return [...items].sort((a, b) =>
      (latest.get(b.capability)?.at ?? "").localeCompare(
        latest.get(a.capability)?.at ?? "",
      ),
    );
  }, [specs, latest]);

  if (!manifest) return null;

  const nodeCount = architecture?.nodes.length ?? 0;
  const layerCount = architecture?.layers.length ?? 0;
  const edgeCount = architecture?.edges.length ?? 0;
  const capCount = capabilities.length;

  const meta = [
    nodeCount > 0 && `${nodeCount} components`,
    capCount > 0 && `${capCount} capabilities`,
    `${prs.length} pull request${prs.length === 1 ? "" : "s"}`,
    manifest.generatedAt && `updated ${relativeTime(manifest.generatedAt)}`,
  ].filter(Boolean) as string[];

  return (
    <div
      className="h-screen w-screen overflow-y-auto"
      style={{ background: "var(--page-bg)" }}
    >
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 sm:px-10">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header
          className="animate-fade-in pt-16 pb-10 sm:pt-24"
          style={{ animationDelay: "0ms" }}
        >
          <div className="mb-4 flex items-baseline gap-3">
            <p
              className="font-mono text-[11px] tracking-[0.22em] uppercase"
              style={{ color: "var(--bpmn-text-dim)" }}
            >
              Repository
            </p>
            {/* Repo switcher — every repo viewer on this host; the active one
                is a quiet label, siblings are links. Hidden on single-repo
                hosts (viewers.json absent or one entry). */}
            {viewerLinks.length > 1 && (
              <span className="ml-auto flex items-center gap-3 font-mono text-[11px]">
                {viewerLinks.map((v) =>
                  v.active ? (
                    <span
                      key={v.href}
                      className="tracking-wide"
                      style={{ color: "var(--bpmn-text)" }}
                    >
                      {v.name}
                    </span>
                  ) : (
                    <a
                      key={v.href}
                      href={v.href}
                      className="tracking-wide transition-colors hover:underline"
                      style={{ color: "var(--bpmn-cyan)" }}
                      title={`Switch to ${v.name}`}
                    >
                      {v.name} ↗
                    </a>
                  ),
                )}
              </span>
            )}
          </div>
          <h1
            className="text-[40px] leading-[1.05] font-semibold sm:text-[56px]"
            style={{
              fontFamily: "var(--bpmn-font-display)",
              color: "var(--bpmn-text)",
              letterSpacing: "-0.02em",
            }}
          >
            {shortRepo(manifest.repo)}
          </h1>
          <p
            className="mt-4 max-w-xl text-[15px] leading-relaxed"
            style={{
              fontFamily: "var(--reading-font)",
              color: "var(--bpmn-text-muted)",
            }}
          >
            The system's architecture and living specifications, with every
            analyzed pull request traced end to end.
          </p>
          <div
            className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[12px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            <a
              href={manifest.repoUrl ?? undefined}
              target={manifest.repoUrl ? "_blank" : undefined}
              rel="noreferrer"
              className={manifest.repoUrl ? "hover:underline" : ""}
              style={{ color: "var(--bpmn-text-muted)", pointerEvents: manifest.repoUrl ? "auto" : "none" }}
            >
              {manifest.repo}
            </a>
            {meta.map((m) => (
              <span key={m} className="flex items-center gap-2.5">
                <span aria-hidden style={{ opacity: 0.5 }}>·</span>
                {m}
              </span>
            ))}
          </div>
        </header>

        {/* ── Architecture — the anchor ────────────────────────────────── */}
        {architecture && nodeCount > 0 && (
          <Section
            index={1}
            icon={Network}
            label="Architecture"
            action={{ to: "/architecture", text: "Open full view" }}
            caption={`${nodeCount} components across ${layerCount} layer${layerCount === 1 ? "" : "s"}, ${edgeCount} integration${edgeCount === 1 ? "" : "s"}.`}
          >
            <div
              className="overflow-hidden rounded-xl border"
              style={{
                borderColor: "var(--bpmn-border-soft)",
                background: "var(--bpmn-canvas, var(--bpmn-surface-soft))",
                height: 460,
              }}
            >
              <ArchitectureCanvas
                nodes={architecture.nodes.filter(
                  (n) => n.kind !== "person" && n.kind !== "system",
                )}
                edges={architecture.edges}
                layers={architecture.layers}
                storageKey={`${manifest.repo}:hub`}
              />
            </div>
          </Section>
        )}

        {/* ── Living specifications ────────────────────────────────────── */}
        {capCount > 0 && (
          <Section
            index={2}
            icon={ScrollText}
            label="Living specifications"
            action={{ to: "/specs", text: `View all ${capCount}` }}
            caption="The behavioral contract the system upholds — maintained as the code evolves."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {capabilities.slice(0, 8).map((spec) => {
                const last = latest.get(spec.capability);
                return (
                  <Link
                    key={spec.capability}
                    to="/specs"
                    className="group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
                    style={{
                      borderColor: "var(--bpmn-border-soft)",
                      background: "var(--bpmn-surface-soft)",
                    }}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: last
                          ? (OP_DOT[last.operation] ?? "var(--bpmn-text-dim)")
                          : "var(--bpmn-border-em)",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="line-clamp-1 text-[13.5px]"
                        style={{
                          fontFamily: "var(--reading-font)",
                          color: "var(--bpmn-text)",
                          fontWeight: 500,
                        }}
                      >
                        {capabilityTitle(spec.capability)}
                      </span>
                      {last && (
                        <span
                          className="mt-0.5 block font-mono text-[10.5px]"
                          style={{ color: "var(--bpmn-text-dim)" }}
                        >
                          {opLabel(last)} {relativeTime(last.at)}
                        </span>
                      )}
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
                      style={{ color: "var(--bpmn-text-muted)" }}
                    />
                  </Link>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Pull requests ────────────────────────────────────────────── */}
        <Section
          index={3}
          icon={GitPullRequest}
          label="Pull requests"
          caption="Each analysis is a self-contained walk through what the change actually does."
        >
          {prs.length === 0 ? (
            <p
              className="rounded-lg border px-4 py-6 text-center font-mono text-[12px]"
              style={{
                borderColor: "var(--bpmn-border-soft)",
                color: "var(--bpmn-text-dim)",
              }}
            >
              No pull requests analyzed yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {prs.map((pr, i) => (
                <PrRow key={pr.url || i} pr={pr} />
              ))}
            </ul>
          )}
        </Section>

        <footer
          className="mt-16 border-t pt-6 font-mono text-[11px]"
          style={{
            borderColor: "var(--bpmn-border-soft)",
            color: "var(--bpmn-text-dim)",
          }}
        >
          Generated by Underscore
          {manifest.generatedAt && ` · ${relativeTime(manifest.generatedAt)}`}
        </footer>
      </div>
    </div>
  );
}

function opLabel(e: SpecHistoryEvent): string {
  if (e.operation === "deleted") return "superseded";
  return e.operation;
}

/** A section shell — number-prefixed label, optional right-aligned action, and
 *  a one-line caption, then the content. The shared vertical rhythm + quiet
 *  staggered entrance that gives the page its calm. */
function Section({
  index,
  icon: Icon,
  label,
  caption,
  action,
  children,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  caption?: string;
  action?: { to: string; text: string };
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fade-in mt-14"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="mb-4 flex items-end gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--bpmn-text-dim)" }} />
          <h2
            className="text-[17px] font-semibold"
            style={{
              fontFamily: "var(--bpmn-font-display)",
              color: "var(--bpmn-text)",
              letterSpacing: "-0.01em",
            }}
          >
            {label}
          </h2>
        </div>
        {action && (
          <Link
            to={action.to}
            className="group ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] transition-colors"
            style={{ color: "var(--bpmn-cyan)" }}
          >
            {action.text}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
      {caption && (
        <p
          className="mb-5 max-w-2xl text-[13.5px] leading-relaxed"
          style={{
            fontFamily: "var(--reading-font)",
            color: "var(--bpmn-text-muted)",
          }}
        >
          {caption}
        </p>
      )}
      {children}
    </section>
  );
}

function PrRow({ pr }: { pr: RepoManifestPr }) {
  const state = pr.state ? STATE_META[pr.state] : undefined;
  return (
    <li>
      <a
        href={pr.url}
        className="group flex items-center gap-4 rounded-lg border px-4 py-3.5 transition-colors"
        style={{
          borderColor: "var(--bpmn-border-soft)",
          background: "var(--bpmn-surface-soft)",
        }}
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: state?.dot ?? "var(--bpmn-text-dim)" }}
          title={state?.label}
        />
        {pr.number != null && (
          <span
            className="shrink-0 font-mono text-[12px] tabular-nums"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            #{pr.number}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className="line-clamp-1 text-[14px]"
            style={{
              fontFamily: "var(--reading-font)",
              color: "var(--bpmn-text)",
              fontWeight: 500,
            }}
          >
            {pr.title}
          </span>
          {pr.summary && (
            <span
              className="mt-0.5 line-clamp-1 block text-[12px]"
              style={{
                fontFamily: "var(--reading-font)",
                color: "var(--bpmn-text-muted)",
              }}
            >
              {pr.summary}
            </span>
          )}
        </span>
        {pr.journeys != null && pr.journeys > 0 && (
          <span
            className="hidden shrink-0 items-center gap-1.5 font-mono text-[11px] sm:flex"
            style={{ color: "var(--bpmn-text-dim)" }}
            title={`${pr.journeys} journeys`}
          >
            <Route className="h-3 w-3" />
            {pr.journeys}
          </span>
        )}
        {pr.updatedAt && (
          <span
            className="hidden shrink-0 font-mono text-[11px] md:block"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            {relativeTime(pr.updatedAt)}
          </span>
        )}
        <ArrowRight
          className="h-4 w-4 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-70"
          style={{ color: "var(--bpmn-text-muted)" }}
        />
      </a>
    </li>
  );
}
