import { SkeletonLine } from "./ui/Skeleton";

/** Content-shaped skeleton for CriteriaTab (redesign plan §6 Tier 1): 8 rail-carded rows,
 * matching CriterionMatrix's real card shape (mono key line, confidence-meter-shaped bar). */
function RailRowSkeleton() {
  return (
    <div className="mb-3 rounded-card border-l-[3px] border-l-border-strong border-y border-r border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <SkeletonLine width="35%" className="h-3" />
        <SkeletonLine width="60px" className="h-3" />
      </div>
      <SkeletonLine width="90%" className="mb-1" />
      <SkeletonLine width="65%" />
    </div>
  );
}

export default function CriteriaSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }, (_, i) => (
        <RailRowSkeleton key={i} />
      ))}
    </div>
  );
}
