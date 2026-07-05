import type {
  BpmnAskRequest,
  BpmnAskResponse,
  BpmnAskResult,
} from "@/types/bpmn-ask";

/**
 * Where the hosted viewer proxies Ask. The report is served from
 * <viewer-root>/reports/<dir>/underscore-report.html (or <viewer-root>/latest/…),
 * and the viewer exposes POST <viewer-root>/ask, injecting the analyzer
 * Authorization header server-side. So the endpoint is the path prefix that
 * precedes the reports|latest segment, plus "ask" — derived exactly like
 * session-shell's sessionsIndexHref(). A downloaded file:// artifact or an
 * unrecognized path has no relay above it → null, and Ask is unavailable.
 */
export function askEndpointHref(): string | null {
  if (!/^https?:$/.test(window.location.protocol)) return null;
  const m = window.location.pathname.match(/^(.*\/)(reports|latest)\/[^/]*/);
  return m ? m[1] + "ask" : null;
}

// The answer model runs well past a normal request; give it a generous ceiling
// before we call the relay unreachable.
const TIMEOUT_MS = 180_000;

/**
 * POST a question to the viewer's Ask relay and map the HTTP outcome to a
 * BpmnAskResult the panel can render. The relay forwards to the analyzer's
 * /bpmn/ask with auth injected server-side, so the browser never holds a token.
 * The status → code mapping mirrors the desktop main-process handler.
 */
export async function bpmnAsk(request: BpmnAskRequest): Promise<BpmnAskResult> {
  const endpoint = askEndpointHref();
  if (!endpoint) {
    // The panel gates on askAvailable() and shouldn't reach here, but be honest
    // if it does: there is no relay to call.
    return { ok: false, code: "unreachable", error: "Ask is unavailable here" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    // Network error or the abort fired — nothing answered.
    return {
      ok: false,
      code: "unreachable",
      error: "analyzer unreachable — try again",
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 200) {
    const data = (await res.json().catch(() => null)) as BpmnAskResponse | null;
    if (data && typeof data.answer === "string") return { ok: true, data };
    return { ok: false, code: "unknown", error: "Ask returned an unexpected response" };
  }
  if (res.status === 422) {
    return {
      ok: false,
      code: "blank-question",
      error: "Enter a question (1–2000 characters)",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      code: "unauthenticated",
      error: "Ask isn't authorized for this report",
    };
  }
  if (res.status === 503) {
    return {
      ok: false,
      code: "unavailable",
      error: "Ask is unavailable — the answer model isn't configured",
    };
  }
  return { ok: false, code: "unknown", error: `Ask failed (HTTP ${res.status})` };
}
