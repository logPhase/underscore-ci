// Logical module grouping — the analyzer's grouping agent partitions the
// canvas services into 3–7 developer-recognizable groups. In the static
// report the groups arrive pre-computed as the `groups` key of
// pr-output.json (the CLI calls POST /grouping at analysis time); the
// client-side layout (group-layout.ts) positions them deterministically
// (#10/#19 stable base map).

/** One logical group of services, as emitted by the analyzer's agent. */
export interface ServiceGroup {
  /** Stable kebab-case slug, e.g. "parking-sessions". */
  id: string;
  name: string;
  description: string;
  /** Member canvas service ids — a partition of the run's services. */
  services: string[];
}

/** A group hull positioned by the client-side layout (group-layout.ts) —
 *  what the canvas renders under the service regions. */
export interface PositionedGroupRegion {
  id: string;
  name: string;
  description: string;
  cx: number;
  cy: number;
  radius: number;
  seed: number;
  serviceIds: string[];
}

// ── Functional components (sub-service file grouping) ──────────────────
// One level finer than service groups: within a single service, the
// file-grouping agent partitions the service's files into business-named
// functional components ("Plate Matching", "Kafka Consumers"). The canvas
// clusters files by COMPONENT instead of namespace package, and journey
// transit lines get component-granular stops. Arrives pre-computed as the
// top-level `fileGroups` key of the payload.

/** One functional component — a business-named partition of a service's
 *  files (a sub-service cluster). */
export interface FunctionalComponent {
  /** Stable slug, e.g. "plate-matching". */
  id: string;
  name: string;
  description: string;
  /** Member file paths — a partition of the owning service's files. */
  files: string[];
}

/** Per-service functional-component partition. The `fileGroups` payload key
 *  is an array of these, one entry per service. */
export interface ServiceFileGroups {
  service: string;
  groups: FunctionalComponent[];
}

/** The component a file resolves to (service + path → component). Value type
 *  of the `fileToComponent` map exposed on TransformedData. The `service`
 *  lets consumers honour the file's own service when a path is mis-scoped. */
export interface FileComponentRef {
  componentId: string;
  componentName: string;
  service: string;
}
