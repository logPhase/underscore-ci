export interface NavigationEntry {
  label: string;
  level: number; // semantic zoom level
  targetId: string; // service/package/file id
  cx: number;
  cy: number;
  zoom: number;
  pinned?: boolean;
}

export interface SelectedFunctionCtx {
  functionId: string;
  fileId: string;
  packageId: string;
  serviceId: string;
  functionName: string;
}

export interface CallChainNode {
  fqn: string;
  name: string;
  fileName: string;
  service: string;
  x: number;
  y: number;
  type: "selected" | "caller" | "callee";
  importance: number;
  description?: string;
  depth?: number; // 0=focal, 1=direct, 2=two-hop, 3+=aggregate; negative for fan-in (-1)
  nodeRole?: "spine" | "branch" | "aggregate" | "fan-in";
  // Role bundling metadata (for aggregate nodes that represent bundled branches)
  bundleRole?: string; // e.g., 'validator', 'data-access'
  bundledFqns?: string[]; // FQNs of bundled functions
  bundledNames?: string[]; // display names of bundled functions
  // Fan-in summary metadata
  fanInCallers?: Array<{ fqn: string; name: string; service: string }>;
  fanInTotalCount?: number;
  fanInFileCount?: number;
  isCrossFile?: boolean; // true if in a different file than the focal function
}

export type ViewType =
  | "structure"
  | "health"
  | "flow"
  | "change"
  | "blast-radius"
  | "boundaries";
export type HealthSubStain = "combined" | "coverage" | "complexity" | "churn";
