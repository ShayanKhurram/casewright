import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import CriteriaTab from "../components/CriteriaTab";
import DraftsTab from "../components/DraftsTab";
import EvidenceTab from "../components/EvidenceTab";
import RFETab from "../components/RFETab";
import StatusPill from "../components/StatusPill";
import StrategyTab from "../components/StrategyTab";
import { apiFetch } from "../lib/api";
import { Case } from "../types";

const TABS = ["Evidence", "Criteria", "Strategy", "Drafts", "RFE"] as const;
type Tab = (typeof TABS)[number];

export default function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>();
  const [tab, setTab] = useState<Tab>("Evidence");

  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiFetch<Case>(`/cases/${caseId}`),
    enabled: !!caseId,
  });

  if (!caseId) return null;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">{caseData?.beneficiary_name}</h1>
          <p className="font-mono text-xs text-slate">{caseData?.visa_category}</p>
        </div>
        {caseData && <StatusPill status={caseData.status} />}
      </div>

      <div className="mb-6 flex gap-1 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm ${
              tab === t ? "border-b-2 border-oxblood text-ink" : "text-slate hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Evidence" && <EvidenceTab caseId={caseId} />}
      {tab === "Criteria" && <CriteriaTab caseId={caseId} />}
      {tab === "Strategy" && <StrategyTab caseId={caseId} />}
      {tab === "Drafts" && <DraftsTab caseId={caseId} />}
      {tab === "RFE" && <RFETab caseId={caseId} />}
    </div>
  );
}
