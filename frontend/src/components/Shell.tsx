import RouteProgressBar from "./shell/RouteProgressBar";
import Sidebar from "./shell/Sidebar";
import Topbar from "./shell/Topbar";

/** App shell (redesign §4): sidebar + topbar chrome goes dark immediately; the content slot
 * keeps an explicit light background for now, since child screens are re-skinned
 * screen-at-a-time in later phases (T5.5–T5.7) — this is the expected intermediate state,
 * not a bug. Remove the bg-paper override here once every screen is migrated. */
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <RouteProgressBar />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-paper">{children}</main>
      </div>
    </div>
  );
}
