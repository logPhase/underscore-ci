import { describe, expect, it } from "vitest";
import { buildCity, type CityDistrictInput } from "./city-layout";

const file = (id: string, lines: number, extra: Partial<{ role: string; importance: number; isEntryPoint: boolean }> = {}) => ({
  id,
  name: id.split("/").pop() ?? id,
  lines,
  role: extra.role ?? "service",
  importance: extra.importance ?? 0,
  isEntryPoint: extra.isEntryPoint ?? false,
});

const sample = (): CityDistrictInput[] => [
  {
    id: "orders",
    name: "Orders",
    files: [
      file("orders/OrderController.cs", 320, { role: "controller", isEntryPoint: true }),
      file("orders/OrderService.cs", 540),
      file("orders/OrderRepo.cs", 120),
      file("orders/tiny.cs", 8),
    ],
  },
  {
    id: "billing",
    name: "Billing",
    files: [
      file("billing/InvoiceService.cs", 900, { importance: 0.9 }),
      file("billing/TaxCalc.cs", 60),
    ],
  },
];

describe("buildCity", () => {
  it("is deterministic — same input yields byte-identical layout", () => {
    const a = JSON.stringify(buildCity(sample()));
    const b = JSON.stringify(buildCity(sample()));
    expect(a).toBe(b);
  });

  it("is order-independent — shuffled input yields the same layout", () => {
    const normal = buildCity(sample());
    const shuffled = sample().reverse().map((d) => ({ ...d, files: [...d.files].reverse() }));
    const out = buildCity(shuffled);
    // sort both building lists by id and compare positions
    const key = (bs: typeof out.buildings) =>
      [...bs].sort((x, y) => (x.id < y.id ? -1 : 1)).map((b) => `${b.id}:${b.x.toFixed(4)},${b.z.toFixed(4)},${b.height.toFixed(4)}`).join("|");
    expect(key(out.buildings)).toBe(key(normal.buildings));
  });

  it("places every file as a building and every non-empty district", () => {
    const out = buildCity(sample());
    expect(out.districts.map((d) => d.id).sort()).toEqual(["billing", "orders"]);
    expect(out.buildings).toHaveLength(6);
  });

  it("height grows with lines; the biggest file is the tallest ordinary building", () => {
    const out = buildCity(sample());
    const big = out.buildings.find((b) => b.id === "billing/InvoiceService.cs")!;
    const small = out.buildings.find((b) => b.id === "billing/TaxCalc.cs")!;
    expect(big.height).toBeGreaterThan(small.height);
  });

  it("promotes exactly one landmark per district; an entry point wins its district", () => {
    const out = buildCity(sample());
    const orders = out.buildings.filter((b) => b.districtId === "orders");
    const landmarks = orders.filter((b) => b.isLandmark);
    expect(landmarks).toHaveLength(1);
    expect(landmarks[0].id).toBe("orders/OrderController.cs"); // the entry point
    // billing has no entry point → the high-importance file becomes the landmark
    const billingLandmark = out.buildings.find((b) => b.districtId === "billing" && b.isLandmark)!;
    expect(billingLandmark.id).toBe("billing/InvoiceService.cs");
  });

  it("keeps buildings inside their district footprint", () => {
    const out = buildCity(sample());
    for (const b of out.buildings) {
      const d = out.districts.find((dd) => dd.id === b.districtId)!;
      expect(b.x - b.width / 2).toBeGreaterThanOrEqual(d.x - 0.01);
      expect(b.x + b.width / 2).toBeLessThanOrEqual(d.x + d.width + 0.01);
      expect(b.z - b.depth / 2).toBeGreaterThanOrEqual(d.z - 0.01);
      expect(b.z + b.depth / 2).toBeLessThanOrEqual(d.z + d.depth + 0.01);
    }
  });
});
