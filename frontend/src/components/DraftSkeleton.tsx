import { SkeletonLine } from "./ui/Skeleton";

/** Content-shaped skeleton for the three-pane draft reviewer (redesign plan §6 Tier 1):
 * heading + paragraph masses in the center pane, with a thin right-rail placeholder. */
export default function DraftSkeleton() {
  return (
    <div className="flex gap-6">
      <div className="w-48 shrink-0 space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonLine key={i} width={i % 2 === 0 ? "90%" : "70%"} />
        ))}
      </div>
      <div className="flex-1">
        <SkeletonLine width="50%" className="mb-4 h-5" />
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonLine key={i} width={i === 5 ? "40%" : "100%"} className="mb-2" />
        ))}
      </div>
      <div className="w-56 shrink-0 space-y-2">
        <SkeletonLine width="80%" />
        <SkeletonLine width="60%" />
      </div>
    </div>
  );
}
