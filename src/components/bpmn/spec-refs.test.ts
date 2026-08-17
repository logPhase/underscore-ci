import { describe, expect, it } from "vitest";
import { resolveSpecContent, specMarkerState } from "./spec-refs";
import type { BpmnSpecRef } from "./types";
import type { SpecsPayload } from "@/types/specs";

const conflictRef: BpmnSpecRef = {
  capability: "anpr-session",
  repo: "u--iris",
  verdict: "conflicts",
  requirement: "THE SYSTEM SHALL queue low-confidence reads for review.",
  why: "the change auto-approves them",
};
const alignedRef: BpmnSpecRef = {
  capability: "pricing",
  repo: "u--iris",
  verdict: "aligned",
  requirement: "THE SYSTEM SHALL apply the weekend rate.",
};

const specs: SpecsPayload = {
  repo_id: "u--iris",
  specs: [
    {
      capability: "anpr-session",
      path: "/specs/anpr-session/spec.md",
      content: "# ANPR session\n\nTHE SYSTEM SHALL queue low-confidence reads for review.",
    },
  ],
  history: [],
  versions: {},
};

describe("specMarkerState", () => {
  it("is null without refs — no badge on unannotated elements", () => {
    expect(specMarkerState({})).toBeNull();
    expect(specMarkerState({ spec_refs: [] })).toBeNull();
  });

  it("counts refs and flags any conflict", () => {
    expect(specMarkerState({ spec_refs: [alignedRef] })).toEqual({
      count: 1,
      conflict: false,
    });
    expect(specMarkerState({ spec_refs: [alignedRef, conflictRef] })).toEqual({
      count: 2,
      conflict: true,
    });
  });
});

describe("resolveSpecContent", () => {
  it("resolves an own-repo capability to the baked spec text", () => {
    expect(resolveSpecContent(conflictRef, specs)).toEqual({
      content: specs.specs[0].content,
      sibling: false,
    });
  });

  it("treats a repo mismatch as a sibling spec (quote-only popup)", () => {
    const sib = { ...conflictRef, repo: "u--iris-vas" };
    expect(resolveSpecContent(sib, specs)).toEqual({
      content: null,
      sibling: true,
    });
  });

  it("a ref with no repo is this repo's; missing capability yields no text", () => {
    const noRepo = { ...alignedRef, repo: undefined };
    expect(resolveSpecContent(noRepo, specs)).toEqual({
      content: null,
      sibling: false,
    });
  });

  it("survives a report with no specs payload at all", () => {
    expect(resolveSpecContent(conflictRef, null)).toEqual({
      content: null,
      sibling: true,
    });
    expect(resolveSpecContent({ ...conflictRef, repo: undefined }, null)).toEqual({
      content: null,
      sibling: false,
    });
  });
});
