import { describe, expect, it } from "vitest";
import { resolveViewerLinks } from "./viewers";

const VIEWERS = [
  { name: "IRIS.VAS", href: "/underscore/" },
  { name: "IRIS", href: "/iris-underscore/" },
];

describe("resolveViewerLinks", () => {
  it("marks the viewer whose href prefixes the current path as active", () => {
    const links = resolveViewerLinks(VIEWERS, "/iris-underscore/");
    expect(links.map((l) => [l.name, l.active])).toEqual([
      ["IRIS.VAS", false],
      ["IRIS", true],
    ]);
  });

  it("prefers the longest matching prefix", () => {
    const overlapping = [
      { name: "A", href: "/u/" },
      { name: "B", href: "/u/nested/" },
    ];
    const links = resolveViewerLinks(overlapping, "/u/nested/reports/x");
    expect(links.find((l) => l.active)!.name).toBe("B");
  });

  it("no match leaves every entry inactive", () => {
    const links = resolveViewerLinks(VIEWERS, "/somewhere-else/");
    expect(links.every((l) => !l.active)).toBe(true);
    expect(links).toHaveLength(2);
  });

  it("drops junk and non-arrays", () => {
    expect(resolveViewerLinks(null, "/")).toEqual([]);
    expect(resolveViewerLinks([{ name: "x" }, 7, { name: "ok", href: "/ok/" }], "/")).toEqual([
      { name: "ok", href: "/ok/", active: false },
    ]);
  });
});
