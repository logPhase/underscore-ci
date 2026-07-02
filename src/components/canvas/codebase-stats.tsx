import HoverTip from "@/components/ui/hover-tip";
import { cn } from "@/lib/misc-utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { Boxes, Braces, FileCode, Route } from "lucide-react";
import { useMemo } from "react";

interface StatCardProps {
  Icon: React.ComponentType<{ className: string; style: React.CSSProperties }>;
  iconColor: string;
  count: number;
  title: string;
  tip: string;
}

const StatCard = ({ Icon, iconColor, count, title, tip }: StatCardProps) => {
  return (
    <HoverTip tip={tip}>
      <span className="inline-flex items-center gap-1.5">
        <Icon className="h-3 w-3" style={{ color: iconColor }} />
        <span className="font-semibold text-zinc-100 tabular-nums">
          {count || 0}
        </span>
        <span className="text-zinc-500">{title}</span>
      </span>
    </HoverTip>
  );
};

const CodebaseStats = () => {
  const transformedData = useAnalysis((s) => s.transformedData);

  const hasPrOverlay = transformedData.prData;
  const services = transformedData.services;
  const sharedLibs = transformedData.sharedLibs;
  const files = transformedData.files;
  const methods = transformedData.methods;
  const journeys = transformedData.journeys;
  const stats = useMemo(
    () => ({
      services: services.length + sharedLibs.length,
      files: Object.entries(files).length,
      methods: Object.entries(methods).length,
      journeys: journeys.length,
    }),
    [files, journeys.length, methods, services.length, sharedLibs.length]
  );

  // if (loadPhase < 5) return null;
  if (stats.services === 0 && stats.files === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-4 z-40 flex w-full items-center justify-center",
        !!hasPrOverlay && "mt-15"
      )}
    >
      <div
        className="pointer-events-auto flex animate-fade-in items-center gap-3 rounded-lg px-3 py-1.5 font-mono text-[11px]"
        style={{
          // --cw-* tokens (index.css, .canvas-stage scope) — dark values are
          // the previous literals; the pill follows paper mode like the map.
          background: "var(--cw-stats-bg)",
          backdropFilter: "blur(12px)",
          border: "1px solid var(--cw-stats-border)",
          color: "var(--cw-stats-text)",
        }}
      >
        <StatCard
          tip="Services and shared libs — the bounded organic regions on the canvas."
          Icon={Boxes}
          iconColor="hsl(180, 50%, 55%)"
          count={stats.services}
          title={stats.services === 1 ? "service" : "services"}
        />

        <span className="text-zinc-700">·</span>

        <StatCard
          tip="Source files — the cells inside each region."
          Icon={FileCode}
          iconColor="hsl(145, 45%, 55%)"
          count={stats.files}
          title={stats.files === 1 ? "file" : "files"}
        />
        <span className="text-zinc-700">·</span>
        <StatCard
          tip="Methods discovered across the codebase — the organelles inside each cell."
          Icon={Braces}
          iconColor="hsl(40, 60%, 60%)"
          count={stats.methods}
          title={stats.methods === 1 ? "method" : "methods"}
        />
        <span className="text-zinc-700">·</span>
        <StatCard
          tip="User journeys — discovered HTTP/event entrypoints with a traced call chain."
          Icon={Route}
          iconColor="hsl(270, 50%, 65%)"
          count={stats.journeys}
          title={stats.journeys === 1 ? "journey" : "journeys"}
        />
      </div>
    </div>
  );
};

export default CodebaseStats;
