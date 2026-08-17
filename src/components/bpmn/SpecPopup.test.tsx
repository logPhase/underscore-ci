import { fireEvent, render, screen } from "@testing-library/react";
import { BpmnCanvas } from "./BpmnCanvas";
import type { BpmnJourney } from "./types";

// jsdom has no ResizeObserver; the canvas only uses it for auto-fit.
class ROStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ROStub;

// Regression guard for the § spec marker → popup path: clicking a marked
// element's badge must open the spec popup with the verdict, the verbatim
// requirement, and the why — and Esc must close it.

const journey: BpmnJourney = {
  journey_id: "j1",
  title: "Vehicle is authorized",
  intent: "authorize",
  actors: [{ id: "driver", label: "Driver" }],
  narrative: "n",
  elements: [
    { id: "s", type: "start-event", label: "Read arrives" },
    {
      id: "t1",
      type: "service-task",
      label: "Validate the plate read",
      spec_refs: [
        {
          capability: "lane-presence",
          repo: "dev--repo",
          verdict: "conflicts",
          requirement: "THE SYSTEM SHALL cancel the pending open command.",
          why: "The changed handler keeps the command queued.",
        },
      ],
    },
    { id: "e", type: "end-event", label: "Done", outcome: "grant" },
  ],
  flows: [
    { from: "s", to: "t1" },
    { from: "t1", to: "e" },
  ],
} as BpmnJourney;

it("opens the spec popup from the § marker and closes on Escape", () => {
  const { container } = render(
    <div className="bpmn-canvas-root">
      <BpmnCanvas journey={journey} />
    </div>,
  );

  // The § badge renders on the annotated element only.
  const badges = [...container.querySelectorAll("svg text")].filter(
    (t) => t.textContent === "§",
  );
  expect(badges).toHaveLength(1);

  fireEvent.click(badges[0].closest("g")!);

  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("lane-presence");
  expect(dialog.textContent).toContain("conflicts");
  expect(dialog.textContent).toContain(
    "THE SYSTEM SHALL cancel the pending open command.",
  );
  expect(dialog.textContent).toContain("The changed handler keeps the command queued.");
  // No specs payload in the store here — the honest fallback note shows
  // instead of full spec text.
  expect(dialog.textContent).toContain("verified against it at analysis time");

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
