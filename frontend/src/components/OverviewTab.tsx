import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { AgentRun, Case } from "../types";
import AgentRunTimeline from "./AgentRunTimeline";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function ProfileList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 font-mono text-xs uppercase text-slate">{label}</p>
      <ul className="list-disc pl-5 text-sm text-ink">
        {items.map((item, i) => (
          <li key={`${item.slice(0, 16)}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function OverviewTab({ caseId, caseData }: { caseId: string; caseData: Case }) {
  const { data: runs } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "running") ? 2000 : false,
  });

  const profile = caseData.profile ?? {};
  const education = isStringArray(profile.education) ? profile.education : [];
  const career = isStringArray(profile.career) ? profile.career : [];
  const headlineAchievements = isStringArray(profile.headline_achievements)
    ? profile.headline_achievements
    : [];
  const hasProfile = education.length > 0 || career.length > 0 || headlineAchievements.length > 0;

  return (
    <div>
      <section className="mb-6">
        <h2 className="mb-2 font-display text-lg text-ink">Beneficiary profile</h2>
        {hasProfile ? (
          <div>
            <ProfileList label="Education" items={education} />
            <ProfileList label="Career" items={career} />
            <ProfileList label="Headline achievements" items={headlineAchievements} />
          </div>
        ) : (
          <p className="text-sm text-slate">No profile yet — run analysis to populate it.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg text-ink">Agent runs</h2>
        <AgentRunTimeline runs={runs ?? []} />
      </section>
    </div>
  );
}