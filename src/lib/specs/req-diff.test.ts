import { removedRequirementCount, touchedRequirements } from "./req-diff";

const SPEC_V1 =
  "# Gate control\n\n" +
  "- When a plate is read, the system shall open the gate.\n" +
  "- When payment fails, the system shall keep the gate closed.";

describe("touchedRequirements", () => {
  it("returns an empty map when nothing changed", () => {
    expect(touchedRequirements(SPEC_V1, SPEC_V1).size).toBe(0);
  });

  it("marks a reworded requirement as changed", () => {
    const v2 =
      "# Gate control\n\n" +
      "- When a plate is read, the system shall open the gate within 2 seconds.\n" +
      "- When payment fails, the system shall keep the gate closed.";

    const touched = touchedRequirements(SPEC_V1, v2);

    expect(touched.get(1)).toBe("changed");
    expect(touched.has(2)).toBe(false);
  });

  it("marks a requirement with no similar predecessor as new", () => {
    const v2 =
      SPEC_V1 +
      "\n- While the barrier arm is blocked, the system shall sound an alarm.";

    const touched = touchedRequirements(SPEC_V1, v2);

    expect(touched.get(3)).toBe("new");
    expect(touched.size).toBe(1);
  });

  it("marks every requirement new when there is no previous version", () => {
    const touched = touchedRequirements(null, SPEC_V1);

    expect(touched.get(1)).toBe("new");
    expect(touched.get(2)).toBe("new");
  });
});

describe("removedRequirementCount", () => {
  it("counts previous requirements that have no similar survivor", () => {
    const v2 =
      "# Gate control\n\n" +
      "- When a plate is read, the system shall open the gate.";

    expect(removedRequirementCount(SPEC_V1, v2)).toBe(1);
  });

  it("is zero when nothing was removed or there is no previous version", () => {
    expect(removedRequirementCount(SPEC_V1, SPEC_V1)).toBe(0);
    expect(removedRequirementCount(null, SPEC_V1)).toBe(0);
  });
});
