import { useState } from "react";

import CommandPalette from "./CommandPalette";
import HelpButton from "./shell/HelpButton";
import RouteProgressBar from "./shell/RouteProgressBar";
import Sidebar from "./shell/Sidebar";
import Topbar from "./shell/Topbar";

/** App shell (redesign §4). Every screen (T5.5–T5.7) is now migrated to the dark token system
 * and paints its own `bg-bg` wrapper, so `<main>` no longer needs the light `bg-paper` override
 * that protected not-yet-migrated screens during the rollout — removed now that the grep for
 * legacy light-theme classes across src/pages and src/components comes back empty.
 *
 * Responsive pass: below `lg`, Sidebar becomes an off-canvas drawer instead of always occupying
 * layout width — `mobileNavOpen` is owned here (not inside Sidebar) since both Sidebar (the
 * drawer itself) and Topbar (the hamburger button that opens it) need to read/drive it. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <RouteProgressBar />
      <CommandPalette />
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
      </div>
      <HelpButton />
    </div>
  );
}
