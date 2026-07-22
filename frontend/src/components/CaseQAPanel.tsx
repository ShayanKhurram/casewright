import { FormEvent, useState } from "react";

import { apiFetch } from "../lib/api";
import { CaseQAResponse } from "../types";
import Button from "./ui/Button";
import Input from "./ui/Input";

type Turn = { question: string; response: CaseQAResponse };

/** Per-case grounded Q&A (plan §7): the answer is grounded strictly in this case's extracted
 * facts, with citations back to the source document/page. Chat history lives only in this
 * component's local state — intentionally not persisted, so a reload clears it. An ungrounded
 * ("Not found in this record") answer is a valid, frequent outcome, not a failure, so it's
 * styled muted rather than as an error. */
export default function CaseQAPanel({ caseId }: { caseId: string }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<CaseQAResponse>(`/cases/${caseId}/qa`, {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setTurns((prev) => [...prev, { question: q, response }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get an answer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg text-text">Ask about this case</h2>
        <p className="mt-1 text-sm text-text-dim">
          Answers are grounded only in this case&rsquo;s extracted facts, with citations back to the source.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about this case…"
          disabled={loading}
          autoFocus
        />
        <Button type="submit" loading={loading} disabled={loading || !question.trim()}>
          Ask
        </Button>
      </form>

      {error && <p className="text-sm text-gap">{error}</p>}

      {turns.length === 0 && !loading ? (
        <p className="text-sm text-text-faint">No questions asked yet.</p>
      ) : (
        <div className="space-y-4">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-sm font-medium text-text">{turn.question}</p>
              {turn.response.grounded ? (
                <div className="rounded-control bg-surface-2 p-3 text-sm text-text">
                  {turn.response.answer}
                  {turn.response.citations.length > 0 && (
                    <span className="ml-2 flex flex-wrap gap-1">
                      {turn.response.citations.map((c) => (
                        <span
                          key={c.fact_id}
                          className="rounded-control border border-border px-1.5 py-0.5 font-mono text-xs text-text-faint"
                        >
                          [{c.exhibit_label ?? "fact"}
                          {c.source_page ? ` p.${c.source_page}` : ""}]
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              ) : (
                <div className="rounded-control border border-border bg-surface-2 p-3 text-sm italic text-text-dim">
                  {turn.response.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}