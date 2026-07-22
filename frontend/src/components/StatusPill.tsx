import Pill from "./ui/Pill";
import { humanizeStatus, statusTone } from "../lib/statusTone";

/** Domain wrapper around the ui-kit's tone-based `Pill`: maps a Case/AgentRun/DraftSection
 * status string to its tone + humanized label. Kept as a separate component (rather than
 * inlining `statusTone`/`humanizeStatus` at every call site) so every screen renders statuses
 * identically. */
export default function StatusPill({ status }: { status: string }) {
  return <Pill tone={statusTone(status)} label={humanizeStatus(status)} />;
}
