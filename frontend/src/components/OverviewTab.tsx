import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import PipelineTracker from "./pipeline/PipelineTracker";
import { AgentRun, Case } from "../types";
import AgentRunTimeline from "./AgentRunTimeline";
import HealthDial from "./HealthDial";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** A structured profile field: a labeled card of rows, not a raw <ul><li> bullet dump
 * (redesign plan §8). */
function ProfileField({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 font-mono text-xs uppercase tracking-wide text-text-dim">{label}</p>
      <div className="rounded-card border border-border bg-surface-2">
        {items.map((item, i) => (
          <div
            key={`${item.slice(0, 16)}-${i}`}
            className={["px-3 py-2 text-sm text-text", i > 0 ? "border-t border-border" : ""].join(" ")}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OverviewTab({ caseId, caseData }: { caseId: string; caseData: Case }) {
  const { data: runs } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });

  const profile = caseData.profile ?? {};
  const education = isStringArray(profile.education) ? profile.education : [];
  const career = isStringArray(profile.career) ? profile.career : [];
  const headlineAchievements = isStringArray(profile.headline_achievements)
    ? profile.headline_achievements
    : [];
  const hasProfile = education.length > 0 || career.length > 0 || headlineAchievements.length > 0;

  const activeRun = runs?.find((r) => r.status === "running" || r.status === "waiting_review");
  const sortedRuns = runs ? [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 font-display text-lg text-text">Case health</h2>
        <HealthDial health={caseData.health} />
      </div>
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 font-display text-lg text-text">Beneficiary profile</h2>
        {hasProfile ? (
          <div>
            <ProfileField label="Education" items={education} />
            <ProfileField label="Career" items={career} />
            <ProfileField label="Headline achievements" items={headlineAchievements} />
          </div>
        ) : (
          <p className="text-sm text-text-dim">No profile yet — run analysis to populate it.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg text-text">Agent runs</h2>
        {activeRun && (
          <div className="mb-4 overflow-x-auto rounded-card border border-border bg-surface p-4">
            <PipelineTracker
              graph={activeRun.graph === "petition" ? "petition" : "rfe"}
              status={activeRun.status}
              progress={activeRun.progress}
            />
          </div>
        )}
        <AgentRunTimeline runs={sortedRuns} />
      </section>
    </div>
    </div>
  );
}
