import { useLocation } from "react-router-dom";

/** 2px accent progress bar on route change (redesign §4). CSS-only: the .route-progress-bar
 * keyframe animation (index.css) runs once per mount, and remounting on pathname change is
 * all the "triggering" this needs — no navigation-state library required for a SPA this size. */
export default function RouteProgressBar() {
  const location = useLocation();

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-50 h-0.5 w-full overflow-hidden bg-transparent">
      <div key={location.pathname} className="route-progress-bar h-full w-full bg-accent" />
    </div>
  );
}
