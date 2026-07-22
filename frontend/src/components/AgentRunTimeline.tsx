import { AgentRun } from "../types";
import StatusPill from "./StatusPill";

/** Humanized copy for a failed run, per redesign plan §7's error taxonomy: the raw exception
 * string moves into a collapsed "Technical details" block instead of being the headline. Note:
 * the plan's example copy promises "retry the run from where it stopped" — this app has no
 * retry-a-failed-run endpoint (only fresh /runs/petition, /runs/rfe starts), so that phrasing
 * isn't used here; promising an action that doesn't exist would be worse than a plain error. */
function FailedRunDetail({ error }: { error: string }) {
  return (
    <div className="mt-1">
      <p className="text-sm text-gap">
        This run couldn't complete. Your case data is unaffected — start a new run when ready.
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-text-faint hover:text-text-dim">
          Technical details
        </summary>
        <pre className="mt-1 whitespace-pre-wrap rounded-control bg-surface-2 p-2 font-mono text-xs text-text-dim">
          {error}
        </pre>
      </details>
    </div>
  );
}

export default function AgentRunTimeline({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-text-dim">No runs yet.</p>;
  }

  const sorted = [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <ul className="divide-y divide-border">
      {sorted.map((r) => (
        <li key={r.id} className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase text-text">{r.graph}</span>
            <StatusPill status={r.status} />
            {r.current_gate && <span className="font-mono text-xs text-text-dim">{r.current_gate}</span>}
            <span className="font-mono text-xs text-text-faint">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          {r.error && <FailedRunDetail error={r.error} />}
        </li>
      ))}
    </ul>
  );
}
