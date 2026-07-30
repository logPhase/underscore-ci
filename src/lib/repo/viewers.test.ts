import { describe, expect, it } from "vitest";
import { manifestOverview, resolveViewerLinks } from "./viewers";

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

describe("manifestOverview", () => {
  it("extracts the portfolio-card numbers from a repo manifest", () => {
    const overview = manifestOverview({
      repo: "apcoa-tech/iris",
      generatedAt: "2026-07-30T10:00:00Z",
      architecture: { nodes: [{}, {}, {}], edges: [{}], layers: [] },
      specs: { specs: [{}, {}], history: [], versions: {} },
      prs: [
        { number: 650, title: "newest", updatedAt: "2026-07-30T09:00:00Z" },
        { number: 649, title: "older", updatedAt: "2026-07-29T09:00:00Z" },
      ],
    });
    expect(overview).toEqual({
      repo: "apcoa-tech/iris",
      generatedAt: "2026-07-30T10:00:00Z",
      components: 3,
      capabilities: 2,
      prs: 2,
      latestPr: { number: 650, title: "newest", updatedAt: "2026-07-30T09:00:00Z" },
    });
  });

  it("tolerates missing architecture/specs/prs", () => {
    const overview = manifestOverview({ repo: "x/y", prs: [] });
    expect(overview).toEqual({
      repo: "x/y", generatedAt: undefined,
      components: 0, capabilities: 0, prs: 0, latestPr: null,
    });
  });

  it("returns null for junk", () => {
    expect(manifestOverview(null)).toBeNull();
    expect(manifestOverview({ notARepo: true })).toBeNull();
  });
});
