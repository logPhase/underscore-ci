import type { MonoService } from "@/types/analysis";
import type { PositionedGroupRegion, ServiceGroup } from "@/types/grouping";

// ---------------------------------------------------------------------------
// Group-aware canvas layout — pure and deterministic (#19: same inputs, same
// output, always). Mirrors the backend's arrange-services-in-circle math:
// group hulls sit on one orbit around the world center, member services sit
// on a compact ring inside their hull. Member radius + seed are preserved so
// blob shapes and sub-service layouts (packages, files) are untouched — only
// cx/cy move (#2: staining-adjacent — the islands keep their identity).
// ---------------------------------------------------------------------------

// World center used by the backend layout (export.clj arrange-services-in-circle).
const WORLD_CX = 400;
const WORLD_CY = 300;

/** Gap between member blob boundaries inside a group. */
const MEMBER_GAP = 40;
/** Gap between group hull boundaries on the orbit. */
const GROUP_GAP = 80;
/** Breathing room between the outermost member edge and the hull. */
const HULL_PADDING = 50;

/** Synthetic group for services the agent's partition missed — defensive
 *  only; the analyzer sweeps unassigned ids into an "other" group itself. */
export const UNGROUPED_ID = "__ungrouped__";

/** Deterministic non-negative 32-bit string hash (djb2/xor variant) — the
 *  renderer-side equivalent of the backend's `|hash(id)|` seed idiom. Feeds
 *  `pr(seed)` in generateBlobPath, so it only needs to be stable + spread. */
export function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface GroupLayoutResult {
  /** Every input service, original order, with new cx/cy (radius/seed kept). */
  services: MonoService[];
  /** Positioned hulls, sorted by group id. */
  groupRegions: PositionedGroupRegion[];
}

interface MemberSlot {
  id: string;
  radius: number;
  /** Offset from the group center. */
  dx: number;
  dy: number;
}

/** Minimum ring radius so no two adjacent circles on the ring overlap:
 *  chord between neighbors i,i+1 must exceed r_i + r_{i+1} + gap
 *  (chord = 2R·sin(π/n)) — same constraint the backend orbit uses. */
function ringRadiusFor(radii: number[], gap: number): number {
  const n = radii.length;
  if (n <= 1) return 0;
  const sinHalf = 2 * Math.sin(Math.PI / Math.max(2, n));
  let need = 0;
  for (let i = 0; i < n; i++) {
    const pair = radii[i] + radii[(i + 1) % n] + gap;
    need = Math.max(need, pair / sinHalf);
  }
  return need;
}

/** Ring the members of one group around its local origin (angle by sorted
 *  index, starting from the top — matching the backend's convention). */
function layoutMembers(members: { id: string; radius: number }[]): {
  slots: MemberSlot[];
  hullRadius: number;
} {
  const n = members.length;
  if (n === 1) {
    return {
      slots: [{ id: members[0].id, radius: members[0].radius, dx: 0, dy: 0 }],
      hullRadius: members[0].radius + HULL_PADDING,
    };
  }
  const ringR = ringRadiusFor(
    members.map((m) => m.radius),
    MEMBER_GAP
  );
  const maxMemberR = Math.max(...members.map((m) => m.radius));
  const slots = members.map((m, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      id: m.id,
      radius: m.radius,
      dx: Math.round(Math.cos(angle) * ringR),
      dy: Math.round(Math.sin(angle) * ringR),
    };
  });
  return { slots, hullRadius: Math.round(ringR + maxMemberR + HULL_PADDING) };
}

/**
 * Reposition services into agent-defined groups. Deterministic: groups are
 * processed sorted by id, members sorted by id; seeds derive from the group
 * id hash. Defensive against a non-partition deliverable: unknown member ids
 * are dropped, duplicate memberships go to the first (sorted) group, and any
 * unassigned service is swept into a synthetic "Ungrouped" hull so every
 * island keeps a position.
 */
export function applyGroupLayout(
  services: MonoService[],
  groups: ServiceGroup[]
): GroupLayoutResult {
  const serviceById = new Map(services.map((s) => [s.id, s]));

  // Resolve memberships — first (sorted) group wins on duplicates.
  const claimed = new Set<string>();
  const resolved: { group: ServiceGroup; memberIds: string[] }[] = [];
  for (const group of [...groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const memberIds = [...new Set(group.services)]
      .filter((id) => serviceById.has(id) && !claimed.has(id))
      .sort((a, b) => a.localeCompare(b));
    memberIds.forEach((id) => claimed.add(id));
    if (memberIds.length > 0) resolved.push({ group, memberIds });
  }
  const unassigned = services
    .map((s) => s.id)
    .filter((id) => !claimed.has(id))
    .sort((a, b) => a.localeCompare(b));
  if (unassigned.length > 0) {
    resolved.push({
      group: {
        id: UNGROUPED_ID,
        name: "Ungrouped",
        description: "Modules the grouping agent did not assign",
        services: unassigned,
      },
      memberIds: unassigned,
    });
  }

  if (resolved.length === 0) return { services, groupRegions: [] };

  // Per-group internal layout first — hull radii feed the orbit sizing.
  const laidOut = resolved.map(({ group, memberIds }) => {
    const members = memberIds.map((id) => ({
      id,
      radius: serviceById.get(id)!.radius,
    }));
    return { group, ...layoutMembers(members) };
  });

  // Orbit for the group hulls — same spirit as the backend service orbit.
  const n = laidOut.length;
  const orbitR =
    n === 1
      ? 0
      : Math.ceil(
          Math.max(
            400,
            250 + 150 * n,
            ringRadiusFor(
              laidOut.map((g) => g.hullRadius),
              GROUP_GAP
            )
          )
        );

  const positionById = new Map<string, { cx: number; cy: number }>();
  const groupRegions: PositionedGroupRegion[] = laidOut.map((g, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.round(WORLD_CX + Math.cos(angle) * orbitR);
    const cy = Math.round(WORLD_CY + Math.sin(angle) * orbitR);
    for (const slot of g.slots) {
      positionById.set(slot.id, { cx: cx + slot.dx, cy: cy + slot.dy });
    }
    return {
      id: g.group.id,
      name: g.group.name,
      description: g.group.description ?? "",
      cx,
      cy,
      radius: g.hullRadius,
      seed: hashString(g.group.id),
      serviceIds: g.slots.map((s) => s.id),
    };
  });

  return {
    services: services.map((svc) => {
      const pos = positionById.get(svc.id);
      return pos ? { ...svc, cx: pos.cx, cy: pos.cy } : svc;
    }),
    groupRegions,
  };
}
