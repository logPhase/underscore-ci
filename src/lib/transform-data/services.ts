import { COLOR_PALETTE } from "@/data/transform-data";
import { Dependency, MonoService, SharedLib } from "@/types/analysis";
import { RawDependency, RawService, RawSharedLib } from "@/types/journey";

export function transformServices(raw: RawService[]): MonoService[] {
  return raw.map((s) => ({
    id: s.id,
    name: s.name || s.id,
    healthScore: s.healthScore ?? 0.5,
    cx: s.cx,
    cy: s.cy,
    radius: s.radius,
    seed: s.seed,
    packages: s.packages || [],
    aiSummary: "",
  }));
}

export function transformSharedLibs(raw: RawSharedLib[]): SharedLib[] {
  return raw.map((lib) => ({
    id: lib.id,
    name: lib.name || lib.id,
    consumedBy: lib.consumedBy || [],
    cx: lib.cx,
    cy: lib.cy,
    radius: lib.radius,
    seed: lib.seed,
    aiSummary: "",
  }));
}

export function transformDependencies(raw: RawDependency[]): Dependency[] {
  return raw.map((d) => ({
    from: d.from,
    to: d.to,
    importCount: d.importCount ?? 1,
    isViolation: d.isViolation ?? false,
  }));
}

export const buildServiceColors = (
  services: MonoService[]
): Record<string, string> => {
  const colors: Record<string, string> = {};
  services.forEach((s, i) => {
    colors[s.id] = COLOR_PALETTE[i % COLOR_PALETTE.length];
  });
  return colors;
};
