import CommandPalette from "./CommandPalette";
import HelpButton from "./shell/HelpButton";
import RouteProgressBar from "./shell/RouteProgressBar";
import Sidebar from "./shell/Sidebar";
import Topbar from "./shell/Topbar";

/** App shell (redesign §4). Every screen (T5.5–T5.7) is now migrated to the dark token system
 * and paints its own `bg-bg` wrapper, so `<main>` no longer needs the light `bg-paper` override
 * that protected not-yet-migrated screens during the rollout — removed now that the grep for
 * legacy light-theme classes across src/pages and src/components comes back empty. */
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <RouteProgressBar />
      <CommandPalette />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
      </div>
      <HelpButton />
    </div>
  );
}
