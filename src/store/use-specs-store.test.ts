import { beforeEach, describe, expect, it } from "vitest";
import { useSpecsStore } from "./use-specs-store";
import type { SpecsPayload } from "@/types/specs";

/** The PATHOLOGICAL shape that blanked the app (real pr-593 payload,
 * 2026-07-07): newer analyzers emit history operation "modified", which the
 * UI's created/updated/deleted vocabulary didn't know — plus assorted holes
 * old payloads can carry. The store (and page, via opStyle) must swallow all
 * of it. */
const PR593_LIKE: SpecsPayload = {
  repo_id: "iris",
  specs: [
    {
      capability: "cpms-authorization",
      path: "/specs/cpms-authorization/spec.md",
      // the LIVING spec carries the newest revision's text
      content: "## CPMS\n\nThe system shall answer within 500ms.",
    },
    {
      capability: "holey",
      path: "/specs/holey/spec.md",
      // content missing entirely on some records
      content: null as unknown as string,
    },
  ],
  history: [
    {
      version_id: "memver_new",
      capability: "cpms-authorization",
      path: "/specs/cpms-authorization/spec.md",
      operation: "modified", // ← the crash vocabulary
      at: "2026-07-07T12:49:00.323787+00:00",
      size: 100,
      sha256: "x",
    },
    {
      version_id: "memver_old",
      capability: "cpms-authorization",
      path: "/specs/cpms-authorization/spec.md",
      operation: "created",
      at: "2026-07-06T06:28:58.859776+00:00",
      size: 90,
      sha256: "y",
    },
    {
      // a hole-y event: no at, unknown op
      version_id: "",
      capability: "holey",
      path: "/specs/holey/spec.md",
      operation: "reconciled",
      at: null as unknown as string,
      size: 0,
      sha256: "",
    },
  ],
  versions: {
    memver_new: {
      version_id: "memver_new",
      capability: "cpms-authorization",
      path: "/specs/cpms-authorization/spec.md",
      operation: "modified",
      at: "2026-07-07T12:49:00.323787+00:00",
      content: "## CPMS\n\nThe system shall answer within 500ms.",
    },
    memver_old: {
      version_id: "memver_old",
      capability: "cpms-authorization",
      path: "/specs/cpms-authorization/spec.md",
      operation: "created",
      at: "2026-07-06T06:28:58.859776+00:00",
      content: "## CPMS\n\nThe system shall answer within 800ms.",
    },
  },
};

beforeEach(() => {
  useSpecsStore.setState({
    repoId: null,
    status: "idle",
    specs: [],
    history: [],
    versions: {},
    selected: null,
    view: "spec",
    diff: null,
    diffError: null,
    reqChanges: {},
    removedReqCounts: {},
  });
});

describe("specs store vs the pr-593 pathological payload", () => {
  it("loads without throwing and selects the most recent capability", () => {
    expect(() => useSpecsStore.getState().load(PR593_LIKE)).not.toThrow();
    const s = useSpecsStore.getState();
    expect(s.status).toBe("ready");
    expect(s.selected).toBe("cpms-authorization");
  });

  it('treats "modified" as a revision: change bars compute against the previous version', () => {
    useSpecsStore.getState().load(PR593_LIKE);
    useSpecsStore.getState().ensureReqChanges("cpms-authorization");
    const s = useSpecsStore.getState();
    // the 800ms→500ms shall-statement counts as touched
    expect(s.reqChanges["cpms-authorization"]).toBeDefined();
    expect(s.reqChanges["cpms-authorization"].size).toBeGreaterThan(0);
  });

  it("null content and hole-y history never throw downstream helpers", () => {
    useSpecsStore.getState().load(PR593_LIKE);
    useSpecsStore.getState().ensureReqChanges("holey"); // null content path
    expect(useSpecsStore.getState().reqChanges["holey"]).toBeUndefined();
    // diff of an event whose version content wasn't exported → quiet note
    useSpecsStore.getState().openDiff(PR593_LIKE.history[2]);
    expect(useSpecsStore.getState().diff).toBeNull();
    expect(useSpecsStore.getState().diffError).toMatch(/wasn't captured/);
  });
});
