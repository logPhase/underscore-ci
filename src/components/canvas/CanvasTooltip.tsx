import { FUNCTION_ROLE_COLORS } from "@/data/transform-data";
import {
  getComponentFunctions,
  getServiceAnomalies,
} from "@/lib/canvas/get-data";
import { getAllFiles, getServiceFiles } from "@/lib/canvas/get-files";
import { getServiceHealth } from "@/lib/canvas/health-score";
import { useAnalysis } from "@/store/use-analysis-store";
import { useHoverStore } from "@/store/use-hover-store";
import { useUIStore } from "@/store/use-ui-store";
import { MethodIndexEntry } from "@/types/analysis";
import { useEffect, useState } from "react";

export function CanvasTooltip() {
  const hoveredElement = useHoverStore((s) => s.hoveredElement);
  const services = useAnalysis((s) => s.transformedData?.services) || [];
  const sharedLibs = useAnalysis((s) => s.transformedData?.sharedLibs) || [];
  const dependencies =
    useAnalysis((s) => s.transformedData?.dependencies) || [];
  const PACKAGE_ROLES =
    useAnalysis((s) => s.transformedData?.PACKAGE_ROLES) || {};
  const SERVICE_COLORS =
    useAnalysis((s) => s.transformedData?.serviceColors) || [];
  const globalMethodIndex =
    useAnalysis((s) => s.transformedData?.globalMethodIndex) || new Map();

  const healthSubStain = useUIStore((s) => s.healthSubStain);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const getMethodInfo = (fqn: string): MethodIndexEntry | undefined =>
    globalMethodIndex.get(fqn);

  useEffect(() => {
    const handler = (e: MouseEvent) =>
      setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (!hoveredElement) return null;

  let content: React.ReactNode = null;

  if (hoveredElement.type === "service") {
    const svc = services.find((s) => s.id === hoveredElement.id);
    if (!svc) return null;
    const files = getServiceFiles(svc.id);
    const health = getServiceHealth(svc.id, healthSubStain);
    const deps = dependencies.filter(
      (d) => d.from === svc.id || d.to === svc.id
    );
    const topDeps = deps.slice(0, 3);
    const svcAnomalies = getServiceAnomalies(svc.id);
    content = (
      <div className="space-y-1.5">
        <div
          className="text-xs font-semibold"
          style={{ color: SERVICE_COLORS[svc.id] }}
        >
          {svc.name}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
          <span style={{ color: "hsl(210, 12%, 45%)" }}>Files:</span>
          <span>{files.length}</span>
          <span style={{ color: "hsl(210, 12%, 45%)" }}>Packages:</span>
          <span>{svc.packages.length}</span>
          <span style={{ color: "hsl(210, 12%, 45%)" }}>Health:</span>
          <span>{(health * 100).toFixed(0)}%</span>
        </div>
        {topDeps.length > 0 && (
          <div
            className="pt-1 text-[10px]"
            style={{
              borderTop: "1px solid hsl(220, 15%, 18%)",
              color: "hsl(210, 12%, 45%)",
            }}
          >
            {topDeps.map((d, i) => (
              <div key={i}>
                <span>
                  → {d.from === svc.id ? d.to : d.from} ({d.importCount}{" "}
                  imports)
                </span>
                {d.aiContext && (
                  <span
                    style={{ color: "hsl(210, 12%, 38%)", fontStyle: "italic" }}
                  >
                    {" "}
                    — {d.aiContext.slice(0, 50)}…
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {svcAnomalies.length > 0 && (
          <div
            className="pt-1 text-[10px]"
            style={{
              borderTop: "1px solid hsl(220, 15%, 18%)",
              color: svcAnomalies.some((a) => a.severity === "high")
                ? "hsl(0, 55%, 60%)"
                : "hsl(35, 55%, 55%)",
            }}
          >
            ⚠ {svcAnomalies.length} issue{svcAnomalies.length > 1 ? "s" : ""}{" "}
            detected
          </div>
        )}
      </div>
    );
  }

  if (hoveredElement.type === "shared") {
    const lib = sharedLibs.find((l) => l.id === hoveredElement.id);
    if (!lib) return null;
    content = (
      <div className="space-y-1.5">
        <div
          className="text-xs font-semibold"
          style={{ color: "var(--cw-label-70)" }}
        >
          {lib.name}
        </div>
        <div className="text-[10px]" style={{ color: "hsl(210, 12%, 45%)" }}>
          Shared library
        </div>
        <div className="text-[10px]">
          <span style={{ color: "hsl(210, 12%, 45%)" }}>Consumed by: </span>
          {lib.consumedBy.join(", ")}
        </div>
        <div className="text-[10px]" style={{ color: "hsl(210, 12%, 45%)" }}>
          {getServiceFiles(lib.id).length} files
        </div>
      </div>
    );
  }

  if (hoveredElement.type === "dep") {
    const dep = dependencies.find(
      (d) => `${d.from}-${d.to}` === hoveredElement.id
    );
    if (!dep) return null;
    content = (
      <div className="space-y-1">
        <div className="text-xs font-semibold">
          {dep.from} → {dep.to}
        </div>
        <div className="text-[10px]" style={{ color: "hsl(210, 12%, 55%)" }}>
          {dep.importCount} imports · {dep.importCount > 10 ? "Strong" : "Weak"}{" "}
          coupling
        </div>
        {dep.isViolation && (
          <div className="text-[10px]" style={{ color: "hsl(0, 55%, 60%)" }}>
            ⚠ Boundary violation
          </div>
        )}
        {dep.aiContext && (
          <div
            className="pt-1 text-[9px]"
            style={{
              borderTop: "1px solid hsl(220, 15%, 18%)",
              color: "hsl(210, 15%, 50%)",
              fontStyle: "italic",
            }}
          >
            {dep.aiContext}
          </div>
        )}
        {dep.label && !dep.aiContext && (
          <div className="text-[10px]" style={{ color: "hsl(210, 12%, 45%)" }}>
            {dep.label}
          </div>
        )}
      </div>
    );
  }

  if (hoveredElement.type === "package") {
    const pkgRole = PACKAGE_ROLES[hoveredElement.id];
    content = (
      <div className="space-y-1 text-xs">
        <div className="font-semibold">{hoveredElement.id.split("/")[1]}</div>
        <div className="text-[10px]" style={{ color: "hsl(210, 12%, 45%)" }}>
          in {hoveredElement.id.split("/")[0]}
        </div>
        {pkgRole && (
          <div
            className="text-[10px]"
            style={{
              color:
                pkgRole.confidence === "high"
                  ? "var(--cw-teal-text)"
                  : "var(--cw-teal-text-dim)",
              fontStyle: pkgRole.confidence === "medium" ? "italic" : "normal",
            }}
          >
            {pkgRole.confidence === "medium" ? "~ " : ""}
            {pkgRole.role}
          </div>
        )}
      </div>
    );
  }

  if (hoveredElement.type === "file") {
    const allFiles = getAllFiles();
    const file = allFiles.find((f) => f.id === hoveredElement.id);
    if (file) {
      content = (
        <div className="space-y-1.5">
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--cw-label-82)" }}
          >
            {file.name}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Size:</span>
            <span>{file.sizeLines} lines</span>
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Coverage:</span>
            <span>{(file.testCoverage * 100).toFixed(0)}%</span>
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Changes (90d):</span>
            <span>{file.changeCount90Days}</span>
          </div>
          <div
            className="pt-1 text-[9px]"
            style={{ borderTop: "1px solid hsl(220, 15%, 18%)" }}
          >
            <span
              style={{
                color:
                  file.confidence === "high"
                    ? "var(--cw-teal-text)"
                    : "var(--cw-teal-text-dim)",
                fontStyle: file.confidence === "medium" ? "italic" : "normal",
              }}
            >
              {file.confidence === "medium" ? "~ " : ""}
              {file.semanticRole}
            </span>
          </div>
        </div>
      );
    }
  }

  if (hoveredElement.type === "method") {
    const methodId = hoveredElement.id;
    const info = getMethodInfo(methodId);
    const allFiles = getAllFiles();
    const file = info ? allFiles.find((f) => f.id === info.fileId) : null;
    const fns = file ? getComponentFunctions(file.id) : [];
    const fn = fns.find((f) => f.id === methodId);
    if (fn) {
      const roleColor = FUNCTION_ROLE_COLORS[fn.role] || "hsl(210, 15%, 50%)";
      content = (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold" style={{ color: roleColor }}>
            {fn.name}()
          </div>
          {fn.description &&
            (() => {
              const isNarrative = fn.description.split(/\s+/).length > 5;
              return (
                <div
                  className="text-[9px] leading-relaxed"
                  style={{
                    color: isNarrative
                      ? "hsl(210, 15%, 60%)"
                      : "hsl(210, 12%, 48%)",
                    fontStyle: isNarrative ? "normal" : "italic",
                    borderLeft: isNarrative
                      ? "2px solid hsla(270, 35%, 50%, 0.3)"
                      : "none",
                    paddingLeft: isNarrative ? 6 : 0,
                    marginTop: isNarrative ? 2 : 0,
                  }}
                >
                  {fn.description}
                </div>
              );
            })()}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Role:</span>
            <span style={{ color: roleColor }}>{fn.role}</span>
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Importance:</span>
            <span>{(fn.importance * 100).toFixed(0)}%</span>
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Complexity:</span>
            <span
              style={{
                color: fn.complexity > 10 ? "hsl(0, 55%, 65%)" : undefined,
              }}
            >
              {fn.complexity}
            </span>
            <span style={{ color: "hsl(210, 12%, 45%)" }}>Lines:</span>
            <span>{fn.lines}</span>
            {file && (
              <>
                <span style={{ color: "hsl(210, 12%, 45%)" }}>File:</span>
                <span>{file.name}</span>
              </>
            )}
            {info?.service && (
              <>
                <span style={{ color: "hsl(210, 12%, 45%)" }}>Service:</span>
                <span>{info.service}</span>
              </>
            )}
          </div>
          {fn.params.length > 0 && (
            <div
              className="pt-1 text-[9px]"
              style={{
                borderTop: "1px solid hsl(220, 15%, 18%)",
                color: "hsl(210, 12%, 50%)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ({fn.params.join(", ")}) → {fn.returnType}
            </div>
          )}
        </div>
      );
    }
  }

  if (!content) return null;

  // Clamp tooltip position to stay within the viewport
  const tooltipW = 280;
  const tooltipH = 160; // estimated max height
  const margin = 8;
  const left =
    mousePos.x + 14 + tooltipW > window.innerWidth - margin
      ? mousePos.x - tooltipW - 10
      : mousePos.x + 14;
  const top =
    mousePos.y + 14 + tooltipH > window.innerHeight - margin
      ? mousePos.y - tooltipH - 10
      : mousePos.y + 14;

  return (
    <div
      className="pointer-events-none fixed z-100 w-fit"
      style={{
        left,
        top,
      }}
    >
      <div
        className="rounded-lg border px-3 py-2.5 text-xs shadow-xl"
        style={{
          // --cw-* tokens (index.css, .canvas-stage scope): dark values are
          // the previous literals; unstyled values inherit --foreground,
          // which flips with the theme — so the card surface must too.
          background: "var(--cw-panel-bg-solid)",
          borderColor: "var(--cw-panel-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        {content}
      </div>
    </div>
  );
}
