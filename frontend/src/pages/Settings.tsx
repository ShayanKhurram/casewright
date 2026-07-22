import { Settings as SettingsIcon } from "lucide-react";

import EmptyState from "../components/ui/EmptyState";

/** Firm/user settings (Phase 8, T8.1 placeholder — out of this plan's scope; the sidebar footer
 * link needs a real route to point at, so this stays a placeholder indefinitely until a real
 * settings screen is scoped). */
export default function Settings() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <EmptyState icon={SettingsIcon} title="Settings" description="Coming soon." />
    </div>
  );
}
