import { SkeletonLine, SkeletonPill } from "./ui/Skeleton";

/** Content-shaped skeleton for the Dashboard's case-card grid (redesign plan §6 Tier 1 rule:
 * skeletons mirror the real layout, not generic gray boxes). Renders 6 card-shaped placeholders
 * in the same grid the real cards use. */
function CardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <SkeletonLine width="70%" className="mb-2 h-4" />
      <SkeletonLine width="35%" className="mb-3" />
      <SkeletonPill />
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
