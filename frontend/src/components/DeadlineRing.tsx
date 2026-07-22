export default function DeadlineRing({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;

  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);

  // Approximate RFE response window as 87 days from issuance; without issued_date
  // we use daysRemaining / 87 as the elapsed fraction, clamped to [0, 1].
  // When overdue (negative) the ring shows a full state, not a partial fraction.
  const RFE_WINDOW = 87;
  const fraction = days < 0 ? 1 : Math.max(0, Math.min(1, days / RFE_WINDOW));

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  // For overdue (days < 0) fraction is 1, showing the full/overdue state.
  const offset = circumference * (1 - fraction);

  const stroke =
    days < 0
      ? "stroke-verdict-gap"
      : days <= 14
        ? "stroke-verdict-partial"
        : "stroke-verdict-met";

  const label = days < 0 ? "OVERDUE" : `${days}d`;

  return (
    <div className="inline-flex items-center justify-center" role="img" aria-label={`RFE response ${label}`}>
      <svg width={48} height={48} viewBox="0 0 48 48">
        <circle cx={24} cy={24} r={radius} fill="none" className="stroke-hairline" strokeWidth={4} />
        {/* No transition/animation: static ring, satisfies prefers-reduced-motion trivially */}
        <circle
          cx={24}
          cy={24}
          r={radius}
          fill="none"
          className={stroke}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 24 24)"
        />
        <text
          x={24}
          y={24}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-ink font-mono"
          style={{ fontSize: days < 0 ? 9 : 11 }}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}