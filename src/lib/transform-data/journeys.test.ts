import { describe, it, expect } from "vitest";
import { readableRawTitle, transformChapters } from "./journeys";

const methods = {
  "mod.A.run": { name: "run", classFqn: "mod.A", file: "a.py" },
  "mod.B.do": { name: "do", classFqn: "mod.B", file: "b.py" },
} as unknown as Parameters<typeof transformChapters>[1];

describe("transformChapters BPMN synthesis (deterministic fallback)", () => {
  it("synthesizes a diagram from steps/edges when the AI bpmn is empty", () => {
    const { chapters } = transformChapters(
      [
        {
          id: "j1",
          entryFqn: "mod.A.run",
          title: "A",
          steps: [{ fqn: "mod.A.run" }, { fqn: "mod.B.do" }],
          edges: [["mod.A.run", "mod.B.do"]],
          bpmn: { journey_id: "j1", title: "A", elements: [], flows: [] },
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    const bpmn = chapters[0].bpmn!;
    expect(bpmn).toBeTruthy();
    expect(bpmn.elements.some((e) => e.type === "service-task")).toBe(true);
    expect(bpmn.elements.find((e) => e.id === "mod.A.run")?.label).toBe("A.run");
  });

  it("synthesizes when the journey has no bpmn field at all", () => {
    const { chapters } = transformChapters(
      [
        {
          id: "j2",
          entryFqn: "mod.A.run",
          title: "A",
          steps: [{ fqn: "mod.A.run" }],
          edges: [],
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    expect(
      chapters[0].bpmn?.elements.some((e) => e.type === "service-task")
    ).toBe(true);
  });

  it("passes a populated AI bpmn through unchanged", () => {
    const ai = {
      journey_id: "j3",
      title: "A",
      elements: [{ id: "x", type: "service-task", label: "X" }],
      flows: [],
    };
    const { chapters } = transformChapters(
      [
        {
          id: "j3",
          entryFqn: "mod.A.run",
          title: "A",
          steps: [{ fqn: "mod.A.run" }],
          edges: [],
          bpmn: ai,
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    expect(chapters[0].bpmn).toEqual(ai);
  });
});

describe("readableRawTitle", () => {
  it("upgrades a bare method-name title to Class · Method from the entry FQN", () => {
    expect(
      readableRawTitle(
        "Exit",
        "Apcoa.IRIS.CPMS.Features.Parkway.Endpoints.ParkwayController.Exit(Dto, CancellationToken)"
      )
    ).toBe("ParkwayController · Exit");
  });

  it("leaves prose titles and mismatched single words untouched", () => {
    expect(readableRawTitle("Authorize a vehicle end-to-end", "A.B.C")).toBe(
      "Authorize a vehicle end-to-end"
    );
    expect(readableRawTitle("Exit", "Some.Other.Method")).toBe("Exit");
    expect(readableRawTitle("", "A.B.C")).toBe("Untitled Chapter");
  });

  it("strips generic arity from the class segment", () => {
    expect(
      readableRawTitle(
        "ProcessMessageAsync",
        "Apcoa.IRIS.Streaming.TracedKafkaProcessor`2.ProcessMessageAsync(ConsumeResult)"
      )
    ).toBe("TracedKafkaProcessor · ProcessMessageAsync");
  });
});

describe("title-echo summaries", () => {
  it("drops a summary that merely echoes the title back", () => {
    const methods = {
      "m.C.HandleAsync": { fqn: "m.C.HandleAsync", name: "HandleAsync", class: "C" },
    } as unknown as Parameters<typeof transformChapters>[1];
    const { chapters } = transformChapters(
      [
        {
          id: "j-echo",
          entryFqn: "m.C.HandleAsync",
          title: "HandleAsync",
          summary: "HandleAsync — ",
          steps: [{ fqn: "m.C.HandleAsync" }],
          edges: [],
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    expect(chapters[0].title).toBe("C · HandleAsync");
    expect(chapters[0].summary).not.toMatch(/HandleAsync\s*—\s*$/);
  });
});

describe("readableRawTitle generics", () => {
  it("survives generic classes with dots inside angle brackets", () => {
    expect(
      readableRawTitle(
        "SetAsync",
        "Apcoa.IRIS.Infrastructure.Caching.Redis.RedisKeyValueCache<TKey, TValue>.SetAsync(TKey, TValue)"
      )
    ).toBe("RedisKeyValueCache · SetAsync");
    expect(
      readableRawTitle(
        "ExecuteBatchAsync",
        "A.B.BaseQueryObject<TSelf, TParams, TResult>.ExecuteBatchAsync(System.Data.IDbConnection)"
      )
    ).toBe("BaseQueryObject · ExecuteBatchAsync");
  });
});
