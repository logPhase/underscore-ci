import { useAnalysis } from "@/store/use-analysis-store";
import { MonoFile } from "@/types/analysis";

export function getAllFiles(): MonoFile[] {
  const files = useAnalysis.getState()?.transformedData?.files || {};
  return Object.values(files);
}

export function getServiceFiles(serviceId: string): MonoFile[] {
  return getAllFiles().filter((f) => f.service === serviceId);
}

export function getPackageFiles(serviceId: string, pkg: string): MonoFile[] {
  return getAllFiles().filter((f) => f.service === serviceId && f.pkg === pkg);
}
