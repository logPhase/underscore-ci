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

/** What a box IS (drives its arc42/C4 SHAPE). `component`/`service` are
 *  first-class code the repo owns (container boxes); `datastore` a persistence
 *  store (cylinder); `external` a third-party/other system (bounded box);
 *  `topic` a message-bus subject/Kafka stream (partitioned-log shape);
 *  `person` a human actor/role (person glyph — C4 Context); `system` the
 *  subject software system as one box (C4 Context). */
export type ArchNodeKind =
  | "component"
  | "service"
  | "datastore"
  | "external"
  | "topic"
  | "person"
  | "system";

/** How two boxes connect. `sync` = request/response (gRPC/HTTP), `async` =
 *  message/event (publish/subscribe), `data` = reads/writes a store,
 *  `dependency` = code-level import/use. */
export type ArchEdgeKind = "sync" | "async" | "data" | "dependency";

/** Architectural EMPHASIS, classified by role (never by name/technology).
 *  `primary` = a business capability, an external interface/endpoint, a
 *  business communication channel, or an external system another team cares
 *  about. `infrastructure` = a cross-cutting technical mechanism that merely
 *  serves the primary elements (persistence/DB-access, cache, serializer,
 *  crypto, DI/wiring/hosting, migration, generic logging, a bus/transport
 *  ADAPTER that only moves bytes). Absent → treated as `primary` (absence of
 *  emphasis must never hide an element). Drives visual weight + the
 *  infrastructure toggle in the canvas. */
export type ArchTier = "primary" | "infrastructure";

/** PR-change marker — only the parts a PR actually touched carry one; the
 *  rest are the stable backdrop. Nodes never "remove" (a removed component
 *  just leaves the diagram); an edge can be removed (integration retired). */
export type ArchNodeStatus = "added" | "modified" | null;
export type ArchEdgeStatus = "added" | "modified" | "removed" | null;

export interface ArchNode {
  id: string;
  name: string;
  kind: ArchNodeKind;
  /** Architectural emphasis (see `ArchTier`). Absent → `primary`. */
  tier?: ArchTier;
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
