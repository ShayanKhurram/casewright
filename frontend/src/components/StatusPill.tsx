const VERDICT_COLORS: Record<string, string> = {
  generated: "text-slate border-hairline",
  approved: "text-verdict-met border-verdict-met",
  needs_attention: "text-verdict-gap border-verdict-gap",
  revision_requested: "text-verdict-partial border-verdict-partial",
  waiting_review: "text-verdict-partial border-verdict-partial",
  completed: "text-verdict-met border-verdict-met",
  failed: "text-verdict-gap border-verdict-gap",
  running: "text-slate border-hairline",
};

export default function StatusPill({ status }: { status: string }) {
  const classes = VERDICT_COLORS[status] ?? "text-slate border-hairline";
  return (
    <span className={`rounded border px-2 py-1 font-mono text-xs uppercase ${classes}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
