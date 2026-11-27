// Ring für das Tagesziel (Minuten heute / Ziel).
export function GoalRing(props: { value: number; goalMin: number; minutes: number; size?: number }) {
  const size = props.size ?? 52;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, props.value));
  const reached = v >= 1;
  return (
    <div
      className={`goal-ring${reached ? ' is-reached' : ''}`}
      role="img"
      aria-label={`Tagesziel: ${props.minutes} von ${props.goalMin} Minuten`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={reached ? 'var(--good)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <span className="goal-ring-label">
        <strong>{props.minutes}</strong>/{props.goalMin}
      </span>
    </div>
  );
}
