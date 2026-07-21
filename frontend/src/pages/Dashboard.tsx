import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { Case } from "../types";

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 font-display text-2xl text-ink">Cases</h1>
      {isLoading && <p className="text-slate">Loading…</p>}
      {error && <p className="text-verdict-gap">Failed to load cases.</p>}
      {data && data.length === 0 && <p className="text-slate">No cases yet.</p>}
      <ul className="divide-y divide-hairline">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-ink">{c.beneficiary_name}</p>
              <p className="font-mono text-xs text-slate">{c.visa_category}</p>
            </div>
            <span className="rounded border border-hairline px-2 py-1 text-xs uppercase text-slate">
              {c.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
