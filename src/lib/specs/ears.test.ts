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
});
