import { MonoFile } from "@/types/analysis";
import { HealthSubStain } from "@/types/store";
import { getServiceFiles } from "./get-files";
import { useAnalysis } from "@/store/use-analysis-store";

export function healthToColor(score: number): string {
  if (score >= 0.7) return `hsl(145, ${50 + score * 20}%, ${40 + score * 10}%)`;
  if (score >= 0.4) return `hsl(40, ${60 + score * 20}%, ${45 + score * 10}%)`;
  return `hsl(0, ${55 + score * 15}%, ${45 + score * 10}%)`;
}

export function getServiceHealth(
  serviceId: string,
  subStain: HealthSubStain
): number {
  const files = getServiceFiles(serviceId);
  const services = useAnalysis.getState().transformedData?.services;
  if (files?.length === 0) {
    const svc = services?.find((s) => s.id === serviceId);
    return svc?.healthScore ?? 0.5;
  }
  switch (subStain) {
    case "coverage":
      return files.reduce((a, f) => a + f.testCoverage, 0) / files.length;
    case "complexity":
      return (
        1 - files.reduce((a, f) => a + f.complexityScore, 0) / files.length
      );
    case "churn":
      return (
        1 -
        Math.min(
          1,
          files.reduce((a, f) => a + f.changeCount90Days, 0) / files.length / 15
        )
      );
    case "combined":
    default:
      return services?.find((s) => s.id === serviceId)?.healthScore ?? 0.5;
  }
}

export function fileHealthScore(
  file: MonoFile,
  subStain: HealthSubStain
): number {
  switch (subStain) {
    case "coverage":
      return file.testCoverage;
    case "complexity":
      return 1 - file.complexityScore;
    case "churn":
      return 1 - Math.min(1, file.changeCount90Days / 15);
    case "combined":
    default: {
      const cx = 1 - file.complexityScore;
      const churn = 1 - Math.min(1, file.changeCount90Days / 15);
      // When coverage data is unavailable (0), average only complexity + churn
      if (file.testCoverage <= 0) return (cx + churn) / 2;
      return (file.testCoverage + cx + churn) / 3;
    }
  }
}
