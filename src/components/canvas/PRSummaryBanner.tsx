import HoverTip from "@/components/ui/hover-tip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/misc-utils";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme";
import { useAnalysis } from "@/store/use-analysis-store";
import { useUIStore } from "@/store/use-ui-store";
import {
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Moon,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color = "text-zinc-50",
}) => (
  <div className="flex items-baseline gap-1.5 rounded border border-zinc-700/70 bg-zinc-900/60 px-2 py-1">
    <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    <span className="text-[10px] text-zinc-300">{label}</span>
  </div>
);

/**
 * PRSummaryBanner — minimal top-of-view header. Job: host the PR-mode toggle
 * and act as the canonical entry point for PR identity / details.
 *
 * Three levels of disclosure:
 *   1. At rest      — branch + truncated ref, just enough to know we're in PR mode
 *   2. On hover     — quick stats (files, +/-, journeys impacted)
 *   3. On click     — full popover with all available PROverlayData fields
 *
 * "Not always needed" → progressively disclosed; users who don't want the
 * details never have to look at them.
 */
const PRSummaryBanner: React.FC = () => {
  const prMode = useUIStore((state) => state.prMode);
  const setPrMode = useUIStore((state) => state.setPrMode);
  const transformedData = useAnalysis((state) => state.transformedData);
  const prOverlayData = transformedData?.prOverlay;

  const [open, setOpen] = useState(false);
  if (!transformedData) return null;
  // Non-PR run: keep the banner shell so the theme toggle (and a drift
  // verdict, if one exists) stay reachable on every data-bearing page.
  // Only the PR-identity popover and the PR-mode switch are PR-gated.
  if (!prOverlayData) {
    return (
      <div
        className="win-drag flex w-full items-center justify-end gap-2.5 px-5 py-2 font-mono text-[12px]"
        style={{
          background: "var(--bpmn-bg)",
          borderBottom: "1px solid var(--bpmn-border-soft)",
        }}
      >
        <ThemeToggle />
      </div>
    );
  }
  const {
    id,
    title,
    baseSha,
    headSha,
    branch,
    baseBranch,
    author,
    state,
    baseRepo,
    headRepo,
    summary,
    prTargetSha,
    behindBy,
  } = prOverlayData;
  const baseShort = baseSha?.slice(0, 7) || "";
  const headShort = headSha?.slice(0, 7) || "";
  const prTargetShort = prTargetSha?.slice(0, 7) || "";
  const isDivergent = !!prTargetSha && !!behindBy;

  // Detect whether the title is the auto-generated "<branch> → <sha7>" form
  // vs an actual PR title pulled from a GitHub URL. Drives both the visible
  // label at rest and the popover's title block.
  const isAutoTitle = !title || /^[\w/-]+\s*[→→]\s*[a-f0-9]{6,}$/.test(title);

  // Quick stats — compute defensively in case summary is missing fields
  const s = summary || ({} as Partial<NonNullable<typeof summary>>);
  const journeyImpact =
    (s.journeysAffected || 0) +
    (s.journeysAdded || 0) +
    (s.journeysRemoved || 0);

  // PR URL — best-effort link. The PR id might come through as "8509" or
  // "pr-8509" depending on the analyzer's source, so strip a "pr-" prefix
  // and require the remainder to be numeric. Only built when we have a repo.
  const prNumber = id?.replace(/^pr[-_]?/i, "");
  const prUrl =
    baseRepo && prNumber && /^\d+$/.test(prNumber)
      ? `https://github.com/${baseRepo}/pull/${prNumber}`
      : undefined;

  const onTogglePRMode = () => {
    setPrMode(!prMode);
  };

  return (
    <div
      className="win-drag flex w-full items-center justify-between gap-3 px-5 py-2 font-mono text-[12px]"
      style={{
        background: "var(--bpmn-bg)",
        borderBottom: "1px solid var(--bpmn-border-soft)",
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-fit w-fit items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-zinc-800/60 data-[state=open]:bg-zinc-800/60"
            aria-label="PR details"
          >
            <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span
              className="truncate"
              style={{
                color: "var(--bpmn-text)",
                maxWidth: "min(60vw, 720px)",
              }}
              title={isAutoTitle ? undefined : title}
            >
              {isAutoTitle ? `${branch || "HEAD"} → ${baseShort}` : title}
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 text-zinc-500 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="rounded-lg border p-0 font-mono text-[12px]"
          style={{
            // Responsive width: fits content but never spills off screen.
            // min keeps short PRs from looking cramped; max prevents an
            // ultra-long title from creating a wall of text.
            width: "max-content",
            minWidth: "min(420px, 90vw)",
            maxWidth: "min(640px, 90vw)",
            maxHeight: "80vh",
            overflowY: "auto",
            background: "var(--bpmn-bg)",
            borderColor: "var(--bpmn-border-soft)",
            color: "var(--bpmn-text)",
          }}
        >
          <div className="space-y-3.5 p-4">
            {/* Title row — only shown when it's not the auto-generated form */}
            {!isAutoTitle && (
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-[10px] tracking-wider text-zinc-400 uppercase">
                  <span>Pull Request</span>
                  {prNumber && /^\d+$/.test(prNumber) && (
                    <span className="tracking-normal text-zinc-200 normal-case">
                      #{prNumber}
                    </span>
                  )}
                  {state && (
                    <span
                      className={`rounded px-1.5 text-[10px] font-medium tracking-normal normal-case ${
                        state === "open"
                          ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-200"
                          : state === "merged"
                            ? "border border-violet-500/30 bg-violet-500/20 text-violet-200"
                            : "border border-zinc-500/30 bg-zinc-500/20 text-zinc-200"
                      }`}
                    >
                      {state}
                    </span>
                  )}
                  {prUrl && (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 tracking-normal text-zinc-300 normal-case hover:text-zinc-50"
                    >
                      open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="text-sm leading-snug font-medium text-zinc-50">
                  {title}
                </div>
                {author && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-zinc-300">
                    <User className="h-3 w-3 text-zinc-400" /> {author}
                  </div>
                )}
              </div>
            )}

            {/* Refs / branches / repos */}
            <div>
              <div className="mb-1.5 text-[10px] tracking-wider text-zinc-400 uppercase">
                Range
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <GitBranch className="h-3 w-3 text-zinc-400" />
                  <span className="text-zinc-300">head</span>
                  <span className="font-medium text-zinc-50">
                    {branch || "—"}
                  </span>
                  <code className="ml-1 text-emerald-300">{headShort}</code>
                  {headRepo && headRepo !== baseRepo && (
                    <span className="ml-1 text-[10px] break-all text-zinc-400">
                      @ {headRepo}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <GitBranch className="h-3 w-3 text-zinc-400" />
                  <span className="text-zinc-300">base</span>
                  {baseBranch ? (
                    <span className="font-medium text-zinc-50">
                      {baseBranch}
                    </span>
                  ) : (
                    <span className="text-zinc-400 italic">unknown branch</span>
                  )}
                  <code className="ml-1 text-amber-300">{baseShort}</code>
                  {baseRepo && (
                    <span className="ml-1 text-[10px] break-all text-zinc-400">
                      @ {baseRepo}
                    </span>
                  )}
                </div>
                {/* Divergence indicator: shown only when the PR is behind main
                 *  and the analyser switched anchor from pr.base.sha to the
                 *  merge-base. Helps the reviewer reconcile our SHA with the
                 *  one shown on github.com. */}
                {isDivergent && (
                  <div className="mt-0.5 flex flex-wrap items-start gap-1.5 text-[10px] leading-snug text-amber-200/80 italic">
                    <span>
                      PR target tip is{" "}
                      <code className="text-amber-300 not-italic">
                        {prTargetShort}
                      </code>
                      ; analysing against merge-base because the PR is{" "}
                      {behindBy} commit{behindBy === 1 ? "" : "s"} behind main.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats grid */}
            {summary && (
              <div>
                <p className="mb-1.5 text-[10px] tracking-wider text-zinc-400 uppercase">
                  Impact
                </p>
                <div
                  className={cn(
                    "grid gap-2 text-[11px]",
                    transformedData.findings ? "grid-cols-4" : "grid-cols-3"
                  )}
                >
                  <Stat label="files" value={s.filesTouched ?? 0} />
                  <Stat label="classes" value={s.classesTouched ?? 0} />
                  <Stat label="journeys" value={journeyImpact} />
                  {transformedData.findings && (
                    <Stat
                      label="findings"
                      value={
                        transformedData.findings.items?.filter(
                          (f) => f.status !== "resolved"
                        ).length ?? 0
                      }
                      color={
                        transformedData.findings.items?.some(
                          (f) =>
                            f.status !== "resolved" && f.severity === "high"
                        )
                          ? "text-rose-400"
                          : "text-zinc-50"
                      }
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Toggles — theme + PR comparison */}
      <div className="flex w-fit items-center gap-2.5" data-tour="pr-toggle">
        <ThemeToggle />
        <label
          htmlFor="pr-mode-toggle"
          className="text-[12px]"
          style={{
            color: prMode ? "hsl(35, 92%, 64%)" : "var(--bpmn-text-dim)",
            fontWeight: prMode ? 600 : 400,
          }}
        >
          {prMode ? "Comparing PR changes" : "Showing HEAD only"}
        </label>
        <HoverTip
          tip={
            prMode ? "Hide PR comparison overlay" : "Show PR comparison overlay"
          }
        >
          {/* ON = saturated amber fill (important beats the base
              data-[state=checked]:bg-primary); OFF = muted grey. Grey must
              read only as OFF — a greyed-out ON toggle looks disabled. */}
          <Switch
            id="pr-mode-toggle"
            className={cn(
              prMode
                ? "!bg-[hsl(35,92%,55%)] border-[hsl(35,80%,42%)]"
                : "!bg-zinc-600/50"
            )}
            checked={prMode}
            onClick={onTogglePRMode}
          />
        </HoverTip>
      </div>
    </div>
  );
};

/** Paper ↔ dark. The class lives on <html>; useState only mirrors it
 *  for the icon. The chrome is --bpmn-* token-driven — the :root dark
 *  baseline in index.css makes the tokens resolve outside
 *  .bpmn-canvas-root, and html.reading-paper remaps them, so the
 *  banner follows the theme it toggles. Exported for the home header. */
export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  // The Cmd+K "Toggle theme" action also calls applyTheme — re-sync the
  // icon mirror whenever the theme changes outside this button.
  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    window.addEventListener("underscore-theme", sync);
    return () => window.removeEventListener("underscore-theme", sync);
  }, []);
  const flip = () => {
    applyTheme(currentTheme() === "paper" ? "dark" : "paper");
  };
  return (
    <HoverTip
      tip={theme === "paper" ? "Switch to dark mode" : "Switch to paper mode"}
    >
      <button
        type="button"
        onClick={flip}
        aria-label={
          theme === "paper" ? "Switch to dark mode" : "Switch to paper mode"
        }
        className="rounded-md border p-1.5 transition-colors"
        style={{
          color: "var(--bpmn-text-dim)",
          borderColor: "var(--bpmn-border-soft)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--bpmn-text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--bpmn-text-dim)";
        }}
      >
        {theme === "paper" ? (
          <Moon className="h-3.5 w-3.5" />
        ) : (
          <Sun className="h-3.5 w-3.5" />
        )}
      </button>
    </HoverTip>
  );
};

export default PRSummaryBanner;
