import { transformToFrontendFormat } from "./index";
import type { RawAnalysisJSON } from "@/types/analysis";

// Guards the SOURCE of the Ask AI session id: the analyzer writes session_id
// into pr-output.json and the transform must surface it as
// transformedData.sessionId. This is the link that was silently missing —
// without it, /bpmn/ask sends no session and can't resolve the staged journey.

it("carries session_id from the analysis payload into transformedData.sessionId", () => {
  const out = transformToFrontendFormat({
    session_id: "01STAGEDSESSION",
  } as RawAnalysisJSON);
  expect(out.sessionId).toBe("01STAGEDSESSION");
});

it("sets sessionId to null when the payload has no session", () => {
  const out = transformToFrontendFormat({} as RawAnalysisJSON);
  expect(out.sessionId).toBe(null);
});
