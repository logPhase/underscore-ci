import { generateBlobPath } from "@/lib/canvas/utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useMemo } from "react";

export const useBlobPaths = () => {
  const services = useAnalysis((s) => s.transformedData?.services);
  const sharedLibs = useAnalysis((s) => s.transformedData?.sharedLibs);
  // Blob paths (stable)
  return useMemo(() => {
    const paths: Record<string, string> = {};
    for (const s of services)
      paths[s.id] = generateBlobPath(s.cx, s.cy, s.radius, s.seed);
    for (const l of sharedLibs)
      paths[l.id] = generateBlobPath(l.cx, l.cy, l.radius, l.seed, 8);
    return paths;
  }, [services, sharedLibs]);
};
