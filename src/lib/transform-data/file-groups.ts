// Functional-component resolution — the sub-service file grouping.
//
// The file-grouping agent partitions each service's files into business-named
// functional components ("Plate Matching", "Kafka Consumers"). This module
// turns that partition into:
//   1. a filePath → component lookup (buildFileToComponent), and
//   2. a per-service package list of component NAMES (componentPackagesByService)
//
// The canvas clusters files by whatever string sits in MonoFile.pkg and draws
// one ring per entry in MonoService.packages. So by overriding pkg with the
// component name and packages with the component-name list, the existing
// package-ring layout renders functional components with zero new layout
// machinery (see transform-data/index.ts + files.ts).

import type { RawFile } from "@/types/journey";
import type { FileComponentRef, ServiceFileGroups } from "@/types/grouping";

/** Build the filePath → component lookup from the fileGroups partition.
 *  Keyed by file path; the value carries the owning service so consumers can
 *  honour the file's OWN service when a path is mis-scoped. */
export function buildFileToComponent(
  fileGroups: ServiceFileGroups[] | null | undefined
): Map<string, FileComponentRef> {
  const map = new Map<string, FileComponentRef>();
  for (const entry of fileGroups ?? []) {
    for (const group of entry.groups ?? []) {
      for (const path of group.files ?? []) {
        map.set(path, {
          componentId: group.id,
          componentName: group.name,
          service: entry.service,
        });
      }
    }
  }
  return map;
}

/** The effective cluster key for a file after the component override: the
 *  component NAME when a component in the file's OWN service claims it, else
 *  the file's namespace package (leftover — the analyzer should sweep these
 *  into an "Other" component, but we degrade gracefully if it doesn't). */
export function effectivePkg(
  path: string,
  file: RawFile,
  fileToComponent: Map<string, FileComponentRef>
): string {
  const ref = fileToComponent.get(path);
  return ref && ref.service === file.service ? ref.componentName : file.package;
}

/** Recompute each service's `packages` list as the ordered set of effective
 *  cluster keys: component names first (in the analyzer's declared order),
 *  then any leftover namespace packages sorted for stability. This drives the
 *  package-ring layout, so the rings + labels become functional components.
 *  Only services that actually own files appear in the result. */
export function componentPackagesByService(
  rawFiles: Record<string, RawFile>,
  fileGroups: ServiceFileGroups[],
  fileToComponent: Map<string, FileComponentRef>
): Map<string, string[]> {
  // The analyzer's declared component-name order, per service.
  const declaredOrder = new Map<string, string[]>();
  for (const entry of fileGroups) {
    const names: string[] = [];
    for (const g of entry.groups ?? [])
      if (!names.includes(g.name)) names.push(g.name);
    declaredOrder.set(entry.service, names);
  }

  // Distinct effective cluster keys actually present, per service.
  const present = new Map<string, Set<string>>();
  for (const [path, f] of Object.entries(rawFiles)) {
    const key = effectivePkg(path, f, fileToComponent);
    let set = present.get(f.service);
    if (!set) present.set(f.service, (set = new Set()));
    set.add(key);
  }

  const result = new Map<string, string[]>();
  for (const [service, set] of present) {
    const declared = declaredOrder.get(service) ?? [];
    const ordered = declared.filter((n) => set.has(n));
    const leftovers = [...set].filter((n) => !ordered.includes(n)).sort();
    result.set(service, [...ordered, ...leftovers]);
  }
  return result;
}
