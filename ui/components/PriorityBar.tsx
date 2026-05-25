type PriorityBarProps = {
  score: number | null;
  compact?: boolean;
  showLabel?: boolean;
};

function PriorityBar({ score, compact = false, showLabel = true }: PriorityBarProps) {
  const value = score !== null && Number.isFinite(score) ? score : 1.0;
  const pct = Math.round(value * 100);

  let colorClass = "priority-bar-high";
  if (value <= 0.4) {
    colorClass = "priority-bar-low";
  } else if (value <= 0.8) {
    colorClass = "priority-bar-mid";
  }

  return (
    <div
      className={`priority-bar ${compact ? "priority-bar-compact" : ""}`}
      title={`Priority: ${value.toFixed(2)}`}
    >
      <div className={`priority-bar-fill ${colorClass}`} style={{ width: `${pct}%` }} />
      {showLabel && <span className="priority-bar-label">{value.toFixed(2)}</span>}
    </div>
  );
}

export default PriorityBar;
