import { useRef, useState } from "react";
import { MessageCircleQuestion, SendHorizontal, PanelRightClose } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { useCodeView } from "@/components/journeys/code-view-store";
import { askEndpointHref, bpmnAsk } from "@/lib/ask-endpoint";
import {
  buildAskRequest,
  type BpmnAskRequest,
  type BpmnAskResult,
  type BpmnAskCitation,
} from "@/types/bpmn-ask";

const isUrl = (s: string) => /^https?:\/\//i.test((s || "").trim());

/** Short, readable label for a step FQN — last Class.Method. */
function shortFqn(fqn: string): string {
  const noArgs = (fqn || "").replace(/\(.*$/, "").trim();
  return noArgs.split(".").slice(-2).join(".") || noArgs;
}

/**
 * Whether Ask can run in this report. True only when the page is served from a
 * hosted viewer (so its /ask relay exists); false for a downloaded file://
 * artifact. The mount site gates on this too, so the panel never renders a
 * dead affordance in offline reports.
 */
export function askAvailable(): boolean {
  return askEndpointHref() !== null;
}

type Msg = {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  answer?: string;
  citations?: BpmnAskCitation[];
  error?: string;
};

/**
 * Right-docked, collapsible "Ask AI" panel for the journey view. Always
 * available (not tied to a step's knowledge popover) — you can ask anything,
 * journey-related or not. When a step is selected its FQN + source ride along
 * as grounding context; otherwise the journey alone is sent. The answer model
 * lives behind the hosted viewer's POST /ask relay (auth injected server-side).
 * Conversation persists while you click around the diagram.
 *
 * Renders nothing when Ask is unavailable (a downloaded file:// report) — there
 * is no relay to reach, so the affordance simply isn't offered.
 */
export function AskPanel({
  stepFqn,
  stepSource,
  journey,
  sessionId,
  repoId,
}: {
  stepFqn?: string;
  stepSource?: string;
  journey?: BpmnAskRequest["journey"];
  sessionId?: string;
  repoId?: string;
}) {
  // Collapsed by default — the diagram is the primary surface (spatial
  // primacy) and an open 380px panel would cover the canvas toolbar,
  // including the fullscreen exit button (the exact occlusion bug the
  // toolbar integration just fixed). The edge tab invites; it never imposes.
  //
  // Open state is shared with the CODE panel via the code-view store so the
  // two right-edge docks never open at once (opening one collapses the
  // other). Ask AI is `rightDock === "ask"`.
  const rightDock = useCodeView((s) => s.rightDock);
  const setRightDock = useCodeView((s) => s.setRightDock);
  const open = rightDock === "ask";
  const setOpen = (next: boolean) => setRightDock(next ? "ask" : null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const context = stepFqn ? shortFqn(stepFqn) : "this journey";

  const submit = async () => {
    const q = question.trim();
    if (!q || busy) return; // 422 blank-question — never send a blank
    const id = idRef.current++;
    setMessages((m) => [...m, { id, question: q, status: "loading" }]);
    setQuestion("");
    setBusy(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9 }));
    try {
      const res: BpmnAskResult = await bpmnAsk(
        buildAskRequest({
          question: q,
          stepFqn,
          stepSource,
          journey,
          sessionId,
          repoId,
        }),
      );
      // Narrow the result here (control-flow narrowing wouldn't survive into
      // the nested setMessages callback) → a flat patch for the matching msg.
      let patch: Partial<Msg>;
      if (res.ok) {
        patch = { status: "done", answer: res.data.answer, citations: res.data.citations };
      } else {
        const fail = res as Extract<BpmnAskResult, { ok: false }>;
        patch = { status: "error", error: fail.error };
      }
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)));
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === id ? { ...msg, status: "error", error: "Ask failed" } : msg,
        ),
      );
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9 }));
    }
  };

  // No relay in this report (downloaded artifact) → offer nothing.
  if (!askAvailable()) return null;

  // Collapsed → a thin right-edge tab that reopens the panel.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask AI"
        className="absolute right-0 top-24 z-40 flex flex-col items-center gap-1 rounded-l-md border border-r-0 px-1.5 py-2.5 shadow"
        style={{
          background: "var(--bpmn-surface)",
          borderColor: "var(--bpmn-cyan)",
          color: "var(--bpmn-cyan)",
        }}
      >
        <MessageCircleQuestion className="h-4 w-4" />
        <span
          className="font-mono text-[9px] uppercase tracking-wider"
          style={{ writingMode: "vertical-rl" }}
        >
          Ask AI
        </span>
      </button>
    );
  }

  return (
    <div
      className="absolute inset-y-0 right-0 z-40 flex w-[380px] flex-col border-l shadow-2xl"
      style={{
        background: "var(--bpmn-surface)",
        borderColor: "var(--bpmn-border)",
        fontFamily: "var(--bpmn-font-mono)",
      }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--bpmn-border)" }}
      >
        <MessageCircleQuestion className="h-4 w-4" style={{ color: "var(--bpmn-cyan)" }} />
        <div className="min-w-0 flex-1">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--bpmn-cyan)" }}
          >
            Ask AI
          </div>
          <div className="truncate text-[9px]" style={{ color: "var(--bpmn-text-dim)" }}>
            about {context}
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          title="Minimize"
          aria-label="Minimize Ask AI"
          className="rounded p-1 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: "var(--bpmn-text-muted)" }}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-3 py-3 text-[11.5px]">
        {messages.length === 0 && (
          <div className="py-6 text-center text-[11px]" style={{ color: "var(--bpmn-text-muted)" }}>
            Ask anything about {context} — or the codebase. Answers are grounded
            in the journey and cite their sources.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-1.5">
            <div
              className="ml-6 rounded-md px-2.5 py-1.5 text-right leading-snug"
              style={{ background: "color-mix(in srgb, var(--bpmn-cyan) 10%, transparent)", color: "var(--bpmn-text)" }}
            >
              {m.question}
            </div>
            {m.status === "loading" && (
              <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--bpmn-text-muted)" }}>
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2"
                  style={{ borderColor: "var(--bpmn-cyan)", borderTopColor: "transparent" }}
                />
                Thinking…
              </div>
            )}
            {m.status === "error" && (
              <div className="text-[10px]" style={{ color: "var(--bpmn-rose)" }}>
                {m.error}
              </div>
            )}
            {m.status === "done" && m.answer != null && (
              <div
                className="rounded-md border px-2.5 py-2"
                style={{ borderColor: "var(--bpmn-border)", background: "color-mix(in srgb, var(--bpmn-cyan) 5%, transparent)" }}
              >
                <Markdown text={m.answer} />
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.citations.map((c, i) => {
                      const cls =
                        "inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[9.5px]";
                      const chip = {
                        background: "var(--bpmn-bg-deep)",
                        borderColor: "var(--bpmn-border)",
                      } as const;
                      if (c.kind === "doc") {
                        const label = c.title ?? c.ref;
                        return isUrl(c.ref) ? (
                          <a
                            key={i}
                            href={c.ref}
                            target="_blank"
                            rel="noreferrer"
                            className={cls + " hover:underline"}
                            style={{ ...chip, color: "var(--bpmn-cyan)" }}
                          >
                            📄 {label} ↗
                          </a>
                        ) : (
                          <span key={i} className={cls} style={{ ...chip, color: "var(--bpmn-text-muted)" }}>
                            📄 {label}
                          </span>
                        );
                      }
                      if (c.kind === "fact") {
                        return (
                          <span key={i} className={cls} style={{ ...chip, color: "var(--bpmn-text-muted)" }}>
                            ◆ {c.ref}
                          </span>
                        );
                      }
                      return (
                        <span key={i} className={cls} style={{ ...chip, color: "var(--bpmn-mint)" }}>
                          🟢 {c.title ?? c.ref}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        className="flex shrink-0 items-end gap-1.5 border-t px-3 py-2.5"
        style={{ borderColor: "var(--bpmn-border)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={`Ask about ${context}…`}
          className="max-h-28 min-h-[34px] min-w-0 flex-1 resize-none rounded-md border bg-transparent px-2 py-1.5 text-[11px] outline-none"
          style={{ borderColor: "var(--bpmn-border)", color: "var(--bpmn-text)" }}
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          aria-label="Send"
          className="shrink-0 rounded-md border p-1.5 transition-opacity disabled:opacity-40"
          style={{ borderColor: "var(--bpmn-cyan)", color: "var(--bpmn-cyan)" }}
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
