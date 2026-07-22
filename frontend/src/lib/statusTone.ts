import type { PillTone } from "../components/ui/Pill";

/** Maps every status string used across Case/AgentRun/DraftSection to a Pill tone, per the
 * redesign plan §5's StatusPill mapping (extended to cover run + section statuses on top of
 * the plan's case-status table, since one StatusPill component serves all three domains).
 * Unknown statuses fall back to "dim" rather than throwing — new statuses shouldn't crash a
 * pill, just render neutrally until this map is extended. */
const TONE_MAP: Record<string, PillTone> = {
  // Case statuses (backend/app/models/case.py CASE_STATUSES)
  intake: "run",
  analyzing: "run",
  strategy_review: "partial",
  drafting: "run",
  draft_review: "partial",
  ready_to_file: "met",
  filed: "dim",
  rfe_received: "gap",
  rfe_review: "partial",
  approved: "met",
  denied: "gap",
  // AgentRun statuses (backend/app/models/ops.py AGENT_RUN_STATUSES)
  running: "run",
  waiting_review: "partial",
  completed: "met",
  failed: "gap",
  // DraftSection statuses (backend/app/models/draft.py SECTION_STATUSES)
  generated: "dim",
  needs_attention: "gap",
  revision_requested: "partial",
};

export function statusTone(status: string): PillTone {
  return TONE_MAP[status] ?? "dim";
}

export function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ");
}

/** Humanize an audit-log `action` (e.g. "case.created", "petition.strategy_drafted") into a
short present-tense phrase for the notification feed and the Overview recent-activity strip.
Covers the real action vocabulary written by `backend/app/services/audit.py`'s call sites
(grepped for `action=`); the few that carry useful `detail` fields get enriched, the rest get a
readable generic rendering. Unknown actions never throw — they fall back to a generic split on
"." and "_" so a newly-added action still renders something sensible until this map catches up. */
export function humanizeAuditAction(action: string, detail: Record<string, unknown>): string {
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  switch (action) {
    case "case.created": {
      const name = str(detail.beneficiary_name);
      return name ? `Case created for ${name}` : "Case created";
    }
    case "document.uploaded": {
      const label = str(detail.exhibit_label) ?? str(detail.kind);
      return label ? `Document uploaded: ${label}` : "Document uploaded";
    }
    case "section.reviewed": {
      const decision = str(detail.decision);
      return decision ? `Section ${decision.replace(/_/g, " ")}` : "Section reviewed";
    }
    case "agent_run.gate_decision": {
      const gate = str(detail.gate);
      const decision = str(detail.decision);
      const head = gate ? `${gate.replace(/_/g, " ")} gate` : "Gate";
      return decision ? `${head} ${decision.replace(/_/g, " ")}` : `${head} decision`;
    }
    case "petition_run.started":
      return "Petition run started";
    case "rfe_run.started":
      return "RFE run started";
    case "petition.intake":
      return "Intake completed";
    case "petition.profiled":
      return "Beneficiary profiled";
    case "petition.criterion_assessed":
      return "Criterion assessed";
    case "petition.strategy_drafted":
      return "Strategy drafted";
    case "petition.drafted":
      return "Petition drafted";
    case "petition.verified":
      return "Petition verified";
    case "petition.finalized":
      return "Petition finalized";
    case "rfe.parsed":
      return "RFE parsed";
    case "rfe.rebuttals_planned":
      return "Rebuttals planned";
    case "rfe.drafted":
      return "RFE drafted";
    case "rfe.verified":
      return "RFE verified";
    case "rfe.finalized":
      return "RFE finalized";
    default: {
      // Generic fallback: "petition.foo_bar" -> "Petition foo bar". Never throws on unknown.
      const [ns, rest] = action.includes(".") ? action.split(".", 2) : [action, ""];
      const phrase = [ns, rest].filter((p) => p.length > 0).join(" ").replace(/_/g, " ");
      return phrase.charAt(0).toUpperCase() + phrase.slice(1);
    }
  }
}

/** Compact relative-time formatter for the recent-activity strip / notification feed
("2h ago", "just now", "3d ago"). Pure, no dependencies. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
