import { buildAskRequest } from "./bpmn-ask";

// The Ask AI panel must always carry session_id + repo_id to /bpmn/ask — the
// analyzer needs them to pick the knowledge base + resolve the staged session.
// These guard the SEND side; index.test.ts guards the SOURCE (the transform).

it("carries session_id + repo_id into the request", () => {
  const req = buildAskRequest({
    question: "what does this step do?",
    stepFqn: "Ns.Class.Method",
    stepSource: "void Method() {}",
    journey: { title: "Exit flow", steps: [{ fqn: "Ns.Class.Method" }] },
    sessionId: "01STAGEDSESSION",
    repoId: "iris-vas",
  });
  expect(req.session_id).toBe("01STAGEDSESSION");
  expect(req.repo_id).toBe("iris-vas");
});

it("never drops the session_id / repo_id fields from the request shape", () => {
  // A regression that removes the mapping (so the backend can't route the KB
  // or resolve the session) must fail here — even when nothing is supplied,
  // the keys stay present.
  const req = buildAskRequest({ question: "anything" });
  expect("session_id" in req).toBe(true);
  expect("repo_id" in req).toBe(true);
});
