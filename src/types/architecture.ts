/** Repository ARCHITECTURE diagram — the system-design view (distinct from
 *  the code-city Canvas and the per-journey Journeys). Nodes are the
 *  system's components / services / data stores / external systems / message
 *  topics; edges are their labeled integrations. Maintained as a durable
 *  artifact in the repo's memory store and updated surgically per PR, so a
 *  node/edge only changes when its backing code actually changed.
 *
 *  Payload-driven like specs/findings: baked into pr-output.json under the
 *  top-level `architecture` key. Every array/field is optional-tolerant —
 *  the analyzer half is built in parallel and older payloads simply omit it.
 */

/** What a box IS. `component`/`service` are first-class code the repo owns;
 *  `datastore` a persistence store; `external` a third-party/other system;
 *  `topic` a message-bus subject (Kafka/ServiceBus). */
export type ArchNodeKind =
  | "component"
  | "service"
  | "datastore"
  | "external"
  | "topic";

/** How two boxes connect. `sync` = request/response (gRPC/HTTP), `async` =
 *  message/event (publish/subscribe), `data` = reads/writes a store,
 *  `dependency` = code-level import/use. */
export type ArchEdgeKind = "sync" | "async" | "data" | "dependency";

/** PR-change marker — only the parts a PR actually touched carry one; the
 *  rest are the stable backdrop. Nodes never "remove" (a removed component
 *  just leaves the diagram); an edge can be removed (integration retired). */
export type ArchNodeStatus = "added" | "modified" | null;
export type ArchEdgeStatus = "added" | "modified" | "removed" | null;

export interface ArchNode {
  id: string;
  name: string;
  kind: ArchNodeKind;
  /** Layer/domain grouping id (see `ArchitecturePayload.layers`). */
  layer?: string | null;
  description?: string | null;
  /** Backing grouping-component ids (provenance). */
  components?: string[];
  /** Backing files (provenance). */
  files?: string[];
  prStatus?: ArchNodeStatus;
}

export interface ArchEdge {
  id: string;
  from: string;
  to: string;
  kind: ArchEdgeKind;
  /** Human label for the integration — "gRPC", "publishes anpr_v3", "reads". */
  label?: string | null;
  prStatus?: ArchEdgeStatus;
}

export interface ArchLayer {
  id: string;
  name: string;
  description?: string | null;
}

export interface ArchitecturePayload {
  version?: number;
  repo?: string;
  generatedAt?: string;
  layers: ArchLayer[];
  nodes: ArchNode[];
  edges: ArchEdge[];
  /** Memory-store artifacts (specs / sibling architectures / knowledge) the
   *  agent read while (re)drawing — surfaced like the findings footer. */
  consulted?: { title: string; ref?: string | null }[];
}
