import { useBlobPaths } from "@/hooks/canvas/use-blob-paths";
import { getAllFiles } from "@/lib/canvas/get-files";
import { getClusteredFilePositions, PositionedFile } from "@/lib/fileLayout";
import { useAnalysis } from "@/store/use-analysis-store";
import { useUIStore } from "@/store/use-ui-store";
import { MonoFile, PackageData } from "@/types/analysis";
import { memo, useCallback, useMemo } from "react";
import ServiceItem, { ServiceRegionProps } from "./service-item";

const ServiceRegion = ({
  semanticGhostServices,
  ghostServices,
  callChainServiceIds,
  isCallChainActive,
  isFocusIsolated,
  regionColor,
  regionOpacity,
  isFlowActive,
  handleRegionClick,
  selectedAnomaly,
  setSelectedAnomaly,
  containerRef,
  filePosRef,
  methodPosRef,
}: ServiceRegionProps) => {
  const services = useAnalysis((s) => s.transformedData?.services) || [];
  const loadPhase = useUIStore((s) => s.loadPhase);
  const blobPaths = useBlobPaths();

  // Landmark entry points per service — spread apart to avoid label overlap
  const landmarks = useMemo(() => {
    const all = getAllFiles();
    const result: Record<string, { name: string; x: number; y: number }[]> = {};
    for (const svc of services) {
      const entries = all
        .filter((f) => f.service === svc.id && f.isEntryPoint)
        .slice(0, 2);
      const spread = Math.max(40, svc.radius * 0.4);
      result[svc.id] = entries.map((e, i) => ({
        name: e.name,
        x: svc.cx + (i === 0 ? -spread : spread),
        y: svc.cy + svc.radius * 0.55 + (i === 1 ? 14 : 0),
      }));
    }
    return result;
  }, [services]);

  // File positions within a package — clustered by semantic role with importance-aware sizing
  // cx/cy override allows using expanded positions
  const getFilePositions = useCallback(
    (
      pkg: PackageData,
      files: MonoFile[],
      cxOverride?: number,
      cyOverride?: number,
      radiusOverride?: number
    ): PositionedFile[] => {
      return getClusteredFilePositions(
        pkg,
        files,
        cxOverride,
        cyOverride,
        radiusOverride
      );
    },
    []
  );

  return (
    loadPhase >= 1 &&
    services.map((svc) => {
      return (
        <ServiceItem
          key={svc.id}
          blobPaths={blobPaths}
          svc={svc}
          regionColor={regionColor}
          regionOpacity={regionOpacity}
          semanticGhostServices={semanticGhostServices}
          ghostServices={ghostServices}
          callChainServiceIds={callChainServiceIds}
          isCallChainActive={isCallChainActive}
          isFocusIsolated={isFocusIsolated}
          isFlowActive={isFlowActive}
          handleRegionClick={handleRegionClick}
          selectedAnomaly={selectedAnomaly}
          setSelectedAnomaly={setSelectedAnomaly}
          containerRef={containerRef}
          filePosRef={filePosRef}
          landmarks={landmarks}
          methodPosRef={methodPosRef}
          getFilePositions={getFilePositions}
        />
      );
    })
  );
};

export default memo(ServiceRegion);
