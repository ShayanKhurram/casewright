import { AgentRun } from "../types";
import StatusPill from "./StatusPill";

export default function AgentRunTimeline({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-slate">No runs yet.</p>;
  }

  const sorted = [...runs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <ul className="divide-y divide-hairline">
      {sorted.map((r) => (
        <li key={r.id} className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase text-ink">{r.graph}</span>
            <StatusPill status={r.status} />
            {r.current_gate && (
              <span className="font-mono text-xs text-slate">{r.current_gate}</span>
            )}
            <span className="font-mono text-xs text-slate">
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>
          {r.error && <p className="mt-1 text-sm text-verdict-gap">{r.error}</p>}
        </li>
      ))}
    </ul>
  );
}