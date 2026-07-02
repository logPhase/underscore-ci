import { getAllFiles } from "@/lib/canvas/get-files";
import { useAnalysis } from "@/store/use-analysis-store";
import { useUIStore } from "@/store/use-ui-store";
import { useCallback, useMemo } from "react";

export const usePRAffectedData = () => {
  const prMode = useUIStore((state) => state.prMode);
  const prData = useAnalysis((s) => s.transformedData?.prData) || null;
  const allFiles = useMemo(() => getAllFiles(), []);

  // Build file path → service ID lookup from real file data
  const filePathToService = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of allFiles) {
      if (f.path) m.set(f.path, f.service);
      if (f.id) m.set(f.id, f.service);
    }
    return m;
  }, [allFiles]);

  const resolveService = useCallback(
    (filePath: string): string => {
      // Try exact match first
      const exact = filePathToService.get(filePath);
      if (exact) return exact;
      // Try suffix match (PR paths may differ from file.path)
      for (const [path, svc] of filePathToService) {
        if (path.endsWith(filePath) || filePath.endsWith(path)) return svc;
      }
      // Fallback: split on / (mock data compat)
      return filePath.split("/")[0];
    },
    [filePathToService]
  );

  const allPRData = useMemo(() => {
    return [
      ...(prData?.filesModified ?? []),
      ...(prData?.filesAdded ?? []),
      ...(prData?.filesDeleted ?? []),
    ];
  }, [prData]);

  // PR affected services
  const prAffectedServices = useMemo(() => {
    if (!prMode || !allPRData.length) return new Set<string>();
    return new Set(allPRData.map((f) => resolveService(f)));
  }, [prMode, resolveService, allPRData]);

  // PR file count per service (for ring thickness scaling)
  const prFileCountByService = useMemo(() => {
    if (!prMode || !allPRData.length) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const f of allPRData) {
      const svc = resolveService(f);
      counts.set(svc, (counts.get(svc) || 0) + 1);
    }
    return counts;
  }, [prMode, allPRData, resolveService]);

  // PR affected packages (service/package path)
  const prAffectedPackages = useMemo(() => {
    if (!prMode || !allPRData.length) return new Set<string>();

    return new Set(
      allPRData.map((f) => {
        const file = allFiles.find(
          (af) => af.path === f || f.endsWith(af.path) || af.path.endsWith(f)
        );
        if (file) return `${file.service}/${file.pkg}`;
        const parts = f.split("/");
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
      })
    );
  }, [prMode, allFiles, allPRData]);

  // PR affected file IDs (for function-level dimming)
  const prAffectedFileIds = useMemo(() => {
    if (!prMode || !prData) return new Set<string>();
    const allPrFiles = [...prData.filesModified, ...prData.filesAdded];
    const ids = new Set<string>();
    for (const pf of allPrFiles) {
      const file = allFiles.find(
        (af) => af.path === pf || pf.endsWith(af.path) || af.path.endsWith(pf)
      );
      if (file) ids.add(file.id);
      else ids.add(pf);
    }
    return ids;
  }, [prMode, prData, allFiles]);

  return {
    prAffectedServices,
    prFileCountByService,
    prAffectedPackages,
    resolveService,
    prAffectedFileIds,
  };
};
