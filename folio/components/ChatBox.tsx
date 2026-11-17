"use client";

import { useEffect, useRef, useState } from "react";
import { askAI, clearChat } from "@/app/(app)/actions/ai";
import { Alert, Button } from "./ui";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Explain my sector concentration.",
  "What does my largest holding actually do?",
  "How diversified is my portfolio?",
  "What is the difference between realized and unrealized P/L?",
  "Why do gold prices move?",
  "What should I watch in an earnings report?",
];

/** Renders AI text safely as plain text: keeps line breaks, turns "- " lines into bullets, strips markdown bold. */
function MessageText({ text }: { text: string }) {
  const lines = text.replace(/\*\*(.+?)\*\*/g, "$1").split(/\r?\n/);
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => {
        const bullet = /^\s*[-*•]\s+/.test(l);
        if (!l.trim()) return null;
        return bullet ? (
          <p key={i} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{l.replace(/^\s*[-*•]\s+/, "")}</span>
          </p>
        ) : (
          <p key={i}>{l.replace(/^#+\s*/, "")}</p>
        );
      })}
    </div>
  );
}

export function ChatBox({ initial }: { initial: ChatMessage[] }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>(initial);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect may only return a clean-up function
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, thinking]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    setError(null);
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setThinking(true);
    const res = await askAI(q);
    setThinking(false);
    if (res.ok) setMsgs((m) => [...m, { role: "assistant", content: res.reply }]);
    else {
      setError(res.error);
      setInput(q); // let them retry easily
    }
  }

  async function clear() {
    if (!window.confirm("Clear your chat history with the AI analyst?")) return;
    await clearChat();
    setMsgs([]);
  }

  return (
    <section aria-label="AI analyst chat" className="flex min-h-[28rem] flex-col rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm font-medium">Chat</p>
        {msgs.length > 0 && (
          <button type="button" onClick={clear} className="text-xs font-medium text-muted hover:text-loss">
            Clear Chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {msgs.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-medium">Ask about stocks, sectors, markets or your own portfolio.</p>
            <p className="mt-1 text-sm text-muted">Try one of these:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-xs text-foreground hover:border-brand hover:text-brand">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-surface text-foreground"
              }`}
            >
              {m.role === "assistant" ? <MessageText text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-sm text-muted">Our analyst is reviewing the tape…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="space-y-2 border-t border-line px-4 py-3 sm:px-5"
      >
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <label htmlFor="ai-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="ai-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="e.g. What is driving the healthcare sector?"
            className="min-h-11 flex-1 resize-none rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <Button type="submit" disabled={thinking || !input.trim()}>
            Ask
          </Button>
        </div>
        <p className="text-[11px] text-muted">Folio&apos;s AI explains, it doesn&apos;t advise. Not financial advice. Answers can be wrong; check important facts.</p>
      </form>
    </section>
  );
}
