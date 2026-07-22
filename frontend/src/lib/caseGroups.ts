/** Case-status grouping shared by the Cases list, the Sidebar's "Cases" badge count, and the
 * Overview screen's stat cards. Extracted out of the old Dashboard.tsx (Phase 8, T8.1) since
 * more than one surface needs it now. Mirrored (by hand — no shared-language way around it) by
 * `_status_priority` in `backend/app/api/rollups.py` for the Clients roll-up's "most urgent
 * status" field; keep the two in sync if this grouping ever changes. */
export const NEEDS_REVIEW = new Set(["strategy_review", "draft_review", "rfe_review"]);
export const CLOSED = new Set(["filed", "approved", "denied"]);

export function groupOf(status: string): "review" | "closed" | "active" {
  if (NEEDS_REVIEW.has(status)) return "review";
  if (CLOSED.has(status)) return "closed";
  return "active";
}
