export default function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;

  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  const color = days < 0 ? "text-verdict-gap" : days <= 14 ? "text-verdict-partial-text" : "text-verdict-met";
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`;

  return (
    <div className="flex items-baseline gap-2 font-mono text-sm">
      <span className="text-slate">Response due {deadline}</span>
      <span className={color}>({label})</span>
    </div>
  );
}
