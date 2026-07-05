import { afterEach, describe, expect, it, vi } from "vitest";
import type { BpmnAskRequest } from "@/types/bpmn-ask";
import { askEndpointHref, bpmnAsk } from "./ask-endpoint";

// The Ask relay is derived from where the report is served — the viewer proxies
// POST <viewer-root>/ask, so the endpoint is the prefix before reports|latest.
// A file:// artifact has no relay and Ask is unavailable. These guard that
// derivation and the HTTP status → result mapping.

function at(protocol: string, pathname: string) {
  Object.defineProperty(window, "location", {
    value: { protocol, pathname },
    configurable: true,
    writable: true,
  });
}

describe("askEndpointHref", () => {
  it("derives /underscore/ask from a hosted report under /reports/", () => {
    at("https:", "/underscore/reports/pr-174/underscore-report.html");
    expect(askEndpointHref()).toBe("/underscore/ask");
  });

  it("derives /underscore/ask from the /latest/ alias", () => {
    at("https:", "/underscore/latest/underscore-report.html");
    expect(askEndpointHref()).toBe("/underscore/ask");
  });

  it("is null for a downloaded file:// artifact", () => {
    at("file:", "/Users/dev/Downloads/underscore-report.html");
    expect(askEndpointHref()).toBeNull();
  });

  it("is null for an unrecognized path (no reports|latest segment)", () => {
    at("https:", "/some/other/page.html");
    expect(askEndpointHref()).toBeNull();
  });
});

describe("bpmnAsk", () => {
  const req: BpmnAskRequest = { question: "what does this step do?" };

  afterEach(() => vi.unstubAllGlobals());

  function respond(status: number, body?: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status, json: async () => body })),
    );
  }

  it("maps 200 with an answer to ok:true", async () => {
    at("https:", "/underscore/reports/pr-1/underscore-report.html");
    respond(200, { answer: "It exits the lane.", citations: [], repo_id: "x", usage: {} });
    const r = await bpmnAsk(req);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.answer).toBe("It exits the lane.");
  });

  it("maps 422 to blank-question", async () => {
    at("https:", "/underscore/reports/pr-1/underscore-report.html");
    respond(422);
    expect(await bpmnAsk(req)).toMatchObject({ ok: false, code: "blank-question" });
  });

  it("maps 401 and 403 to unauthenticated", async () => {
    at("https:", "/underscore/reports/pr-1/underscore-report.html");
    respond(401);
    expect(await bpmnAsk(req)).toMatchObject({ ok: false, code: "unauthenticated" });
    respond(403);
    expect(await bpmnAsk(req)).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("maps 503 to unavailable", async () => {
    at("https:", "/underscore/reports/pr-1/underscore-report.html");
    respond(503);
    expect(await bpmnAsk(req)).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("maps a network failure to unreachable", async () => {
    at("https:", "/underscore/reports/pr-1/underscore-report.html");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    expect(await bpmnAsk(req)).toMatchObject({ ok: false, code: "unreachable" });
  });

  it("is unreachable when there is no relay endpoint (file://)", async () => {
    at("file:", "/Users/dev/underscore-report.html");
    expect(await bpmnAsk(req)).toMatchObject({ ok: false, code: "unreachable" });
  });
});
