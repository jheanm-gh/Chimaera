interface Props {
  readonly label: string;
  /** What the creature has now, including any epigenetic head start. */
  readonly value: number;
  /** What its genes allow. The pale bar. */
  readonly ceiling: number;
  readonly min: number;
  readonly max: number;
  readonly fraction: number;
}

/**
 * Two bars in one track: the pale one is the genetic ceiling, the solid one is
 * what raising has actually reached. Showing only the achieved value would hide
 * the single most important number in the game.
 */
export function StatBar({ label, value, ceiling, min, max, fraction }: Props) {
  const span = Math.max(1e-6, max - min);
  const ceilingPct = Math.max(0, Math.min(100, ((ceiling - min) / span) * 100));
  const valuePct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return (
    <div className="statbar">
      <span className="statbar-label">{label}</span>
      <span
        className="statbar-track"
        role="img"
        aria-label={`${label}: ${value.toFixed(0)} of a possible ${ceiling.toFixed(0)} (${Math.round(fraction * 100)}% of ceiling)`}
      >
        <i className="statbar-ceiling" style={{ width: `${ceilingPct}%` }} />
        <i className="statbar-value" style={{ width: `${valuePct}%` }} />
      </span>
      <span className="statbar-value-text">
        {value.toFixed(0)}
        <em>/{ceiling.toFixed(0)}</em>
      </span>
    </div>
  );
}
