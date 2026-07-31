import { splitSpecBlocks } from "./ears";

describe("splitSpecBlocks", () => {
  it("keeps plain prose as a single markdown block", () => {
    const md = "# Purpose\n\nThis capability identifies plates.";

    const blocks = splitSpecBlocks(md);

    expect(blocks).toEqual([{ kind: "md", text: md }]);
  });

  it("turns a paragraph containing 'shall' into a numbered requirement", () => {
    const md =
      "## Requirements\n\nWhen a plate is read, the system shall create a session.";

    const blocks = splitSpecBlocks(md);

    expect(blocks).toEqual([
      { kind: "md", text: "## Requirements" },
      {
        kind: "req",
        reqNo: 1,
        text: "When a plate is read, the system shall create a session.",
      },
    ]);
  });

  it("gives each shall bullet its own requirement number", () => {
    const md =
      "- The system shall retry once.\n- The system shall log failures.";

    const blocks = splitSpecBlocks(md);

    expect(blocks).toEqual([
      { kind: "req", reqNo: 1, text: "The system shall retry once." },
      { kind: "req", reqNo: 2, text: "The system shall log failures." },
    ]);
  });

  it("numbers requirements top-to-bottom across sections", () => {
    const md =
      "## Entry\n\nThe system shall open the gate.\n\n## Exit\n\nThe system shall close the gate.";

    const blocks = splitSpecBlocks(md);

    const reqs = blocks.filter((b) => b.kind === "req");
    expect(reqs.map((r) => r.reqNo)).toEqual([1, 2]);
  });

  it("never treats headings or code fences as requirements", () => {
    const md =
      "## What the system shall do\n\n```\nx.shall()\n```\n\nProse without the keyword.";

    const blocks = splitSpecBlocks(md);

    expect(blocks.every((b) => b.kind === "md")).toBe(true);
  });

  it("parses '### Requirement:' sections (the analyzer's spec format)", () => {
    // Real analyzer output: a named requirement heading with the SHALL body
    // directly beneath — NO blank line between heading and paragraph.
    const md =
      "# ANPR observability specification\n\n" +
      "## Requirements\n\n" +
      "### Requirement: Handlers are the single source of lifecycle events\n" +
      "The processors SHALL NOT emit a session-created event themselves.\n\n" +
      "### Requirement: Gap metric derives from authoritative events\n" +
      "The dashboard SHALL derive gaps from handler events only.\n\n" +
      "Second paragraph of the same requirement, still its body.\n\n" +
      "## Notes\n\nplain prose";

    const blocks = splitSpecBlocks(md);
    const reqs = blocks.filter((b) => b.kind === "req");

    expect(reqs).toHaveLength(2);
    expect(reqs[0]).toMatchObject({
      reqNo: 1,
      title: "Handlers are the single source of lifecycle events",
    });
    expect(reqs[0].kind === "req" && reqs[0].text).toContain("SHALL NOT emit");
    expect(reqs[1]).toMatchObject({
      reqNo: 2,
      title: "Gap metric derives from authoritative events",
    });
    expect(reqs[1].kind === "req" && reqs[1].text).toContain(
      "Second paragraph of the same requirement",
    );
    // the trailing prose section stays markdown
    expect(blocks[blocks.length - 1].kind).toBe("md");
  });

  it("requirement heading with a blank line before the body still binds", () => {
    const md =
      "### Requirement: Retry once\n\nThe system SHALL retry exactly once.";

    const blocks = splitSpecBlocks(md);
    const reqs = blocks.filter((b) => b.kind === "req");

    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ reqNo: 1, title: "Retry once" });
  });
});
