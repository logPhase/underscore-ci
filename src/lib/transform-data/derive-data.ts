import { Dependency, MonoFile, MonoService } from "@/types/analysis";
import { Anomaly, RawFile, RawMethod, RawStep } from "@/types/journey";

/** All FQNs participating in a journey: union of edge endpoints + entry. */
export function deriveChapterFunctions(
  edges: [string, string][],
  entryFqn: string
): string[] {
  const seen = new Set<string>();
  if (entryFqn) seen.add(entryFqn);
  for (const [from, to] of edges) {
    if (from) seen.add(from);
    if (to) seen.add(to);
  }
  return [...seen];
}

/** Ordered services touched by a journey: walk steps in order, look up the
 *  method's file, then the file's service. Returns each unique service in
 *  first-touched order. */
export function deriveChapterServices(
  steps: RawStep[],
  methods: Record<string, RawMethod>,
  files: Record<string, RawFile>
): string[] {
  const out: string[] = [];
  for (const s of steps) {
    const file = methods[s.fqn]?.file;
    const svc = file ? files[file]?.service : undefined;
    if (svc && !out.includes(svc)) out.push(svc);
  }
  return out;
}

export function deriveAnomalies(
  svcs: MonoService[],
  files: MonoFile[],
  deps: Dependency[]
): Anomaly[] {
  const result: Anomaly[] = [];
  let anomId = 0;

  // Per-service: high complexity files
  for (const svc of svcs) {
    const svcFiles = files.filter((f) => f.service === svc.id);
    const highCx = svcFiles.filter((f) => f.complexityScore > 0.75);
    if (highCx.length >= 3) {
      result.push({
        id: `real-anom-${++anomId}`,
        affectedElement: svc.id,
        anomalyType: "complexity",
        severity: highCx.some((f) => f.complexityScore > 0.9)
          ? "high"
          : "medium",
        shortDescription: `${highCx.length} files with high complexity (>0.75)`,
        explanation: `${svc.name} has ${highCx.length} files exceeding complexity threshold. Top: ${highCx
          .sort((a, b) => b.complexityScore - a.complexityScore)
          .slice(0, 3)
          .map((f) => f.name)
          .join(", ")}.`,
        confidence: "high",
      });
    }
  }

  // Boundary violations from dependencies
  for (const dep of deps) {
    if (dep.isViolation) {
      const fromSvc = svcs.find((s) => s.id === dep.from);
      const toSvc = svcs.find((s) => s.id === dep.to);
      if (fromSvc && toSvc) {
        result.push({
          id: `real-anom-${++anomId}`,
          affectedElement: dep.from,
          anomalyType: "boundary-violation",
          severity: "high",
          shortDescription: `Boundary violation: ${fromSvc.name} depends on ${toSvc.name}`,
          explanation: `${fromSvc.name} has ${dep.importCount} imports crossing into ${toSvc.name}, violating the expected service boundary.`,
          confidence: "high",
        });
      }
    }
  }

  // High coupling: services with excessive outbound dependencies
  for (const svc of svcs) {
    const outbound = deps.filter((d) => d.from === svc.id);
    if (outbound.length >= 5) {
      result.push({
        id: `real-anom-${++anomId}`,
        affectedElement: svc.id,
        anomalyType: "coupling",
        severity: outbound.length >= 8 ? "high" : "medium",
        shortDescription: `High coupling: ${outbound.length} outbound dependencies`,
        explanation: `${svc.name} depends on ${outbound.length} other services/libraries. High coupling increases blast radius of changes.`,
        confidence: "high",
      });
    }
  }

  return result;
}

export function derivePackageRoles(data: {
  services: MonoService[];
  dependencies: Dependency[];
  files: MonoFile[];
}) {
  // Build PACKAGE_ROLES from real data (service/pkg -> role label)
  const newRoles: Record<
    string,
    { role: string; confidence: "high" | "medium" }
  > = {};

  for (const file of data.files) {
    const key = `${file.service}/${file.pkg}`;
    if (!newRoles[key]) {
      // Use the package name as the role label, titlecased
      const label = file.pkg
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      newRoles[key] = { role: label || file.pkg, confidence: "high" };
    }
  }
  const PACKAGE_ROLES = newRoles;

  // Derive anomalies from real data instead of using mock data

  return PACKAGE_ROLES;
}
