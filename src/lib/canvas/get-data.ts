import { useAnalysis } from "@/store/use-analysis-store";
import { ComponentFunction, CrossModuleFlow } from "@/types/analysis";
import { Anomaly } from "@/types/journey";
import { getServiceFiles } from "./get-files";

export function getServiceAnomalies(serviceId: string): Anomaly[] {
  const anomalies = useAnalysis.getState().transformedData?.anomalies || [];
  return anomalies.filter((a) => a.affectedElement === serviceId);
}

export function getHighSeverityCount(serviceId: string): number {
  const anomalies = useAnalysis.getState().transformedData?.anomalies || [];
  return anomalies.filter(
    (a) => a.affectedElement === serviceId && a.severity === "high"
  ).length;
}

export function getServiceChangeRecency(serviceId: string): number {
  const files = getServiceFiles(serviceId);
  if (files.length === 0) return 6;
  return files.reduce((a, f) => a + f.lastModifiedMonths, 0) / files.length;
}

export function getRegionCenter(id: string): { cx: number; cy: number } | null {
  const services = useAnalysis.getState().transformedData?.services || [];
  const sharedLibs = useAnalysis.getState().transformedData?.sharedLibs || [];

  const svc = services.find((s) => s.id === id);
  if (svc) return { cx: svc.cx, cy: svc.cy };
  const lib = sharedLibs.find((l) => l.id === id);
  if (lib) return { cx: lib.cx, cy: lib.cy };
  return null;
}

export function getPackageRegionCenter(serviceId: string, packageId: string) {
  const packages = useAnalysis.getState().transformedData?.packages;

  const { cx: serviceCX, cy: serviceCY } = getRegionCenter(serviceId);

  const packageData = packages?.get(serviceId);
  if (packageData) {
    const packageItem = packageData.find((pkg) => pkg.id == packageId);
    if (packageItem) {
      const displayCx = serviceCX + (packageItem.cx - serviceCX) * 2.2;
      const displayCy = serviceCY + (packageItem.cy - serviceCY) * 2.2;
      return { ...packageItem, cx: displayCx, cy: displayCy };
    }
  }
  return null;
}

export function getComponentFunctions(
  componentId: string
): ComponentFunction[] {
  const functions = useAnalysis.getState().transformedData?.functions || [];
  if (functions) {
    const realFns = functions[componentId];
    if (realFns && realFns.length > 0) {
      return realFns;
    }
    // File exists in real data but has no functions — return empty array
    // (don't fall through to mock generation for real codebases)
    return [];
  }
}

// Given a function name and optionally a serviceId, find which flow it belongs to.
// Matches by exact function name first, then by serviceId participation.
export function getFlowForFunction(
  functionName: string,
  serviceId?: string
): CrossModuleFlow | null {
  const crossModuleFlows =
    useAnalysis.getState().transformedData?.crossModuleFlows || [];
  if (crossModuleFlows.length === 0) return null;

  // Exact function name match first
  for (const flow of crossModuleFlows) {
    if (flow.nodes.some((n) => n.functionName === functionName)) {
      return flow;
    }
  }
  // If a serviceId is provided, return any flow that includes that service
  if (serviceId) {
    for (const flow of crossModuleFlows) {
      if (flow.nodes.some((n) => n.serviceId === serviceId)) {
        return flow;
      }
    }
  }
  return null;
}
