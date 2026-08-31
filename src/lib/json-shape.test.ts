import { describe, expect, it } from "vitest";
import { jsonLines, matchPaths } from "./json-shape";

describe("jsonLines", () => {
  it("flattens nested objects with dot-paths", () => {
    const lines = jsonLines({ company: { score: 0.87, name: "ACME" } });
    const byPath = Object.fromEntries(lines.map((l) => [l.path + ":" + l.kind, l]));
    expect(byPath["company.score:value"].text).toBe("0.87");
    expect(byPath["company.score:value"].depth).toBe(2);
    expect(byPath["company.name:value"].text).toBe('"ACME"');
    expect(lines[0].text).toBe("{");
    expect(lines[lines.length - 1].kind).toBe("close");
  });

  it("indexes array elements and caps long arrays", () => {
    const lines = jsonLines({ rows: [1, 2, 3, 4, 5, 6] });
    expect(lines.some((l) => l.path === "rows[0]")).toBe(true);
    const cap = lines.find((l) => l.kind === "cap");
    expect(cap?.text).toBe("… 3 more");
    expect(lines.some((l) => l.path === "rows[3]")).toBe(false);
  });

  it("renders type-string leaves as plain strings", () => {
    const lines = jsonLines({ score: "float 0-100" });
    expect(lines.find((l) => l.path === "score")?.text).toBe('"float 0-100"');
  });
});

describe("matchPaths", () => {
  const writes = ["company.score", "events[].weight"];

  it("hits the written path and everything inside it", () => {
    expect(matchPaths("company.score", writes)).toBe("hit");
    expect(matchPaths("events[2].weight", writes)).toBe("hit");
  });

  it("marks ancestors as containing a write", () => {
    expect(matchPaths("company", writes)).toBe("contains");
    expect(matchPaths("events[0]", writes)).toBe("contains");
  });

  it("ignores unrelated paths, roots, and empty declarations", () => {
    expect(matchPaths("company.name", writes)).toBe(null);
    expect(matchPaths("companyx", writes)).toBe(null);
    expect(matchPaths("", writes)).toBe(null);
    expect(matchPaths("company.score", [])).toBe(null);
  });
});
