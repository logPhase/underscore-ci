import { getRegionCenter } from "@/lib/canvas/get-data";
import { depLinePath } from "@/lib/canvas/utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useMemo } from "react";

export const useDepPaths = () => {
  const dependencies = useAnalysis((s) => s.transformedData?.dependencies);
  return useMemo(() => {
    if (!dependencies) return [];
    return dependencies
      .map((dep, i) => {
        const from = getRegionCenter(dep.from);
        const to = getRegionCenter(dep.to);
        if (!from || !to) return null;
        return { dep, ...depLinePath(from.cx, from.cy, to.cx, to.cy, i) };
      })
      .filter(Boolean) as {
      dep: (typeof dependencies)[0];
      path: string;
      cx: number;
      cy: number;
    }[];
  }, [dependencies]);
};
