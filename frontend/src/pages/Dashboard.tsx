import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import StatusPill from "../components/StatusPill";
import { apiFetch } from "../lib/api";
import { Case } from "../types";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [visaCategory, setVisaCategory] = useState<"O-1A" | "EB-1A">("EB-1A");
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!beneficiaryName.trim()) return;
    setCreating(true);
    try {
      await apiFetch<Case>("/cases", {
        method: "POST",
        body: JSON.stringify({ beneficiary_name: beneficiaryName, visa_category: visaCategory }),
      });
      setBeneficiaryName("");
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 font-display text-2xl text-ink">Cases</h1>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate">Beneficiary name</label>
          <input
            value={beneficiaryName}
            onChange={(e) => setBeneficiaryName(e.target.value)}
            className="rounded border border-hairline px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate">Visa category</label>
          <select
            value={visaCategory}
            onChange={(e) => setVisaCategory(e.target.value as "O-1A" | "EB-1A")}
            className="rounded border border-hairline px-2 py-1 text-sm"
          >
            <option value="EB-1A">EB-1A</option>
            <option value="O-1A">O-1A</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creating || !beneficiaryName.trim()}
          className="rounded bg-oxblood px-3 py-1 text-sm text-paper hover:opacity-90 disabled:opacity-50"
        >
          New case
        </button>
      </form>

      {isLoading && <p className="text-slate">Loading…</p>}
      {error && <p className="text-verdict-gap">Failed to load cases.</p>}
      {data && data.length === 0 && <p className="text-slate">No cases yet.</p>}
      <ul className="divide-y divide-hairline">
        {data?.map((c) => (
          <li key={c.id}>
            <Link to={`/cases/${c.id}`} className="flex items-center justify-between py-3 hover:bg-hairline">
              <div>
                <p className="text-ink">{c.beneficiary_name}</p>
                <p className="font-mono text-xs text-slate">{c.visa_category}</p>
              </div>
              <StatusPill status={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
