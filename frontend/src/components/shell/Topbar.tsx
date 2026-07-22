import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { apiFetch } from "../../lib/api";
import { Case } from "../../types";
import RunIndicator from "./RunIndicator";
import UserMenu from "./UserMenu";

function Breadcrumb() {
  const { caseId } = useParams<{ caseId: string }>();
  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiFetch<Case>(`/cases/${caseId}`),
    enabled: !!caseId,
  });

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Link to="/" className="text-text-dim hover:text-text">
        Cases
      </Link>
      {caseId && (
        <>
          <span className="text-text-faint">/</span>
          <span className="text-text">{caseData?.beneficiary_name ?? "…"}</span>
        </>
      )}
    </div>
  );
}

export default function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg px-6">
      <Breadcrumb />
      <div className="flex items-center gap-3">
        <RunIndicator />
        <UserMenu />
      </div>
    </header>
  );
}
