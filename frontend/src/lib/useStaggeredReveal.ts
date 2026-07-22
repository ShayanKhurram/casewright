import { useEffect, useRef, useState } from "react";

/** Tracks which ids in `currentIds` are newly seen since this hook last ran (redesign plan
 * §6's "progressive reveal": criterion cards / RFE objections / draft sections animate in as
 * they land, not on every unrelated re-render). Returns a Map from id -> its stagger index
 * (0-based) among the ids that are new *this batch* — callers use that index to compute a
 * `animationDelay` for the 60ms stagger. An id absent from the map has already been shown and
 * should render without any entrance animation. */
export function useStaggeredReveal(currentIds: string[]): Map<string, number> {
  const seenRef = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);
  const key = currentIds.join(",");

  const newIds = currentIds.filter((id) => !seenRef.current.has(id));
  const staggerMap = new Map<string, number>();
  newIds.forEach((id, i) => staggerMap.set(id, i));

  useEffect(() => {
    if (newIds.length === 0) return;
    for (const id of newIds) seenRef.current.add(id);
    // One more render so these ids read as "already seen" on the next pass — the entrance
    // plays once, not on every unrelated re-render.
    forceRerender((n) => n + 1);
    // `key` (currentIds joined) is the real dependency; newIds is derived from it each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return staggerMap;
}
