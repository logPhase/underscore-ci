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
