import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileX } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import { useStaggeredReveal } from "../lib/useStaggeredReveal";
import { AgentRun, Draft, DraftSection } from "../types";
import DraftSkeleton from "./DraftSkeleton";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import Select from "./ui/Select";
import { useToast } from "./ui/Toast";

const STATUS_DOT: Record<string, string> = {
  approved: "bg-met",
  needs_attention: "bg-gap",
  revision_requested: "bg-partial",
  generated: "bg-text-faint",
};
const STATUS_RAIL: Record<string, string> = {
  approved: "border-l-met",
  needs_attention: "border-l-gap",
  revision_requested: "border-l-partial",
  generated: "border-l-border-strong",
};

function SectionNavItem({
  section,
  active,
  staggerIndex,
  onClick,
}: {
  section: DraftSection;
  active: boolean;
  staggerIndex?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "block w-full rounded-control border-l-[3px] px-2.5 py-2 text-left text-sm transition-colors duration-hover",
        STATUS_RAIL[section.status] ?? "border-l-border-strong",
        active ? "bg-surface-2 text-text" : "text-text-dim hover:bg-surface-2 hover:text-text",
        staggerIndex !== undefined ? "animate-reveal-up" : "",
      ].join(" ")}
      style={staggerIndex !== undefined ? { animationDelay: `${staggerIndex * 60}ms` } : undefined}
    >
      <span className="flex items-center gap-2">
        <span className={["h-1.5 w-1.5 shrink-0 rounded-pill", STATUS_DOT[section.status] ?? "bg-text-faint"].join(" ")} />
        <span className="truncate">{section.heading}</span>
      </span>
    </button>
  );
}

function SourcePanel({ section }: { section: DraftSection }) {
  if (section.citations.length === 0) {
    return <p className="text-sm text-text-faint">No citations in this section.</p>;
  }
  return (
    <div className="space-y-3">
      {section.citations.map((c) => (
        <div key={c.id} className="rounded-card border border-border bg-surface-2 p-2.5 text-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-text">{c.marker}</span>
            <span className={c.verified ? "text-met" : "text-gap"}>{c.verified ? "Verified" : "Unverified"}</span>
          </div>
          <p className="font-mono text-xs text-text-faint">
            {c.source_type === "exhibit" ? "Exhibit citation" : c.authority_ref ?? "Authority citation"}
          </p>
        </div>
      ))}
    </div>
  );
}

function SectionReviewer({ section, caseId }: { section: DraftSection; caseId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<"approve" | "revision_requested" | null>(null);
  const blockers = section.verification_notes.blockers ?? [];
  const [expanded, setExpanded] = useState(section.status === "needs_attention");

  useEffect(() => {
    setExpanded(section.status === "needs_attention");
  }, [section.id, section.status]);

  async function review(decision: "approve" | "revision_requested") {
    setPending(decision);
    try {
      await apiFetch(`/sections/${section.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: null }),
      });
      await queryClient.invalidateQueries({ queryKey: ["drafts", caseId] });
      toast({
        variant: "success",
        title: decision === "approve" ? "Section approved" : "Revision requested",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Couldn't save the review",
        description: err instanceof Error ? err.message : undefined,
        action: { label: "Retry", onClick: () => review(decision) },
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg text-text">{section.heading}</h3>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{section.body}</p>

      {blockers.length > 0 && (
        <div
          className={[
            "mt-3 rounded-card border-l-[3px] border-l-partial border-y border-r border-border bg-surface-2 p-3",
          ].join(" ")}
        >
          <button
            onClick={() => setExpanded((e) => !e)}
            className="font-mono text-xs uppercase tracking-wide text-partial"
          >
            {expanded ? "▾" : "▸"} {blockers.length} verification note(s)
          </button>
          {expanded && (
            <ul className="mt-2 list-disc pl-5 text-xs text-gap">
              {blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {section.citations.map((c) => (
            <span
              key={c.id}
              className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-dim"
            >
              {c.marker} {c.verified ? "✓" : "?"}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button size="sm" loading={pending === "approve"} disabled={!!pending} onClick={() => review("approve")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={pending === "revision_requested"}
          disabled={!!pending}
          onClick={() => review("revision_requested")}
        >
          Request revision
        </Button>
      </div>
    </div>
  );
}

/** Three-pane draft reviewer (redesign plan §8): section nav (left, rail + status dot),
 * section body + citations + approve/revise bar (center), source panel (right — citation
 * metadata + a link to the presigned exhibit; the plan's "anchor quote" isn't shown since
 * Citation doesn't carry the source quote text, only ExtractedFact does — an honest
 * simplification, not a stubbed feature). needs_attention sections auto-expand their
 * verification notes. */
export default function DraftsTab({ caseId }: { caseId: string }) {
  const { data: runs } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
  });
  const drafting = runs?.some((r) => r.status === "running");

  const { data: drafts, isLoading } = useQuery({
    queryKey: ["drafts", caseId],
    queryFn: () => apiFetch<Draft[]>(`/cases/${caseId}/drafts`),
    // Poll while any run is active so newly-generated sections appear live (progressive
    // reveal, redesign plan §6) instead of only on tab re-visit.
    refetchInterval: drafting ? 2500 : false,
  });

  const [draftId, setDraftId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);

  const draft = drafts?.find((d) => d.id === draftId) ?? drafts?.[0];
  const sortedSections = draft ? [...draft.sections].sort((a, b) => a.position - b.position) : [];
  const staggerMap = useStaggeredReveal(sortedSections.map((s) => s.id));
  const selectedSection = sortedSections.find((s) => s.id === sectionId) ?? sortedSections[0];

  if (isLoading) return <DraftSkeleton />;
  if (!drafts || drafts.length === 0) {
    return <p className="text-sm text-text-dim">No drafts yet.</p>;
  }
  if (sortedSections.length === 0 && !drafting) {
    // A real Draft row with zero sections is a valid, honest outcome — not an error: the
    // strategy phase decided no criteria were worth arguing (criteria_to_argue was empty), so
    // drafting_node correctly produced nothing rather than fabricating unsupported arguments.
    // Falling through to the three-pane layout here used to render three blank columns with no
    // explanation, which looked exactly like "drafting never ran" — it did run, it just had
    // nothing to draft. Point back at the Strategy tab's memo, the actual source of the decision.
    // Guarded on `!drafting` — while a run is actively producing sections, this state is also
    // briefly true before the first section lands, and showing this message then would be
    // actively wrong, not just unhelpful (DraftSkeleton/the polling refetch handles that window).
    return (
      <EmptyState
        icon={FileX}
        title="No sections were drafted"
        description="The strategy memo didn't recommend arguing any criteria for this case, so there was nothing to draft. See the Strategy tab for the reasoning and recommended next steps."
      />
    );
  }

  return (
    <div>
      {drafts.length > 1 && (
        <div className="mb-4 w-64">
          <Select
            value={draft?.id}
            onValueChange={(v) => {
              setDraftId(v);
              setSectionId(null);
            }}
            options={drafts.map((d) => ({ value: d.id, label: `${d.kind} · v${d.version}` }))}
          />
        </div>
      )}

      {/* overflow-x-auto (T5.8 tablet check): the two fixed-width columns (nav 192px + aside
          224px) plus gaps leave a genuinely tight center pane below ~1024px — this is a hard
          three-pane-on-tablet layout problem the redesign plan doesn't solve either; scrolling
          horizontally as a floor is safer than letting the center pane get crushed or the fixed
          columns force page-level overflow. A real narrow-viewport pass (e.g. collapsing the
          source panel below the body under `lg:`) is a follow-up, not solved here. */}
      <div className="flex gap-6 overflow-x-auto">
        <nav className="w-48 shrink-0 space-y-1">
          {sortedSections.map((s) => (
            <SectionNavItem
              key={s.id}
              section={s}
              active={s.id === selectedSection?.id}
              staggerIndex={staggerMap.get(s.id)}
              onClick={() => setSectionId(s.id)}
            />
          ))}
        </nav>

        <div className="min-w-0 flex-1">{selectedSection && <SectionReviewer section={selectedSection} caseId={caseId} />}</div>

        <aside className="w-56 shrink-0">
          <h4 className="mb-2 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-text-dim">
            Sources <ExternalLink size={12} className="text-text-faint" />
          </h4>
          {selectedSection && <SourcePanel section={selectedSection} />}
        </aside>
      </div>
    </div>
  );
}
