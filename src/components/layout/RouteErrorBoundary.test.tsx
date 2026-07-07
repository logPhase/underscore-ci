import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Bomb(): never {
  throw new Error("modified is not in OP_STYLE");
}

describe("RouteErrorBoundary", () => {
  it("catches a page crash and renders the recovery card instead of blanking", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Bomb />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText(/something broke/i)).toBeTruthy();
    expect(screen.getByText(/modified is not in OP_STYLE/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /reload report/i })).toBeTruthy();
    expect(screen.getByText(/other tabs in the rail keep working/i)).toBeTruthy();
    spy.mockRestore();
  });

  it("renders children untouched when nothing throws", () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <div>healthy page</div>
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText("healthy page")).toBeTruthy();
    expect(screen.queryByText(/something broke/i)).toBeNull();
  });
});
