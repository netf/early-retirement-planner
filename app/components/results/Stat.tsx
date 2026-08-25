export function Stat({ label, value, unit, note, tone = "plain", info }: { label: string; value: string; unit?: string; note?: string; tone?: "plain" | "good" | "warn"; info?: React.ReactNode }) {
  return (
    <div className={`stat ${tone}`}>
      <span className="stat-label">{label}{info}</span>
      <strong className="stat-value">{value}{unit ? <small> {unit}</small> : null}</strong>
      {note ? <span className="stat-note">{note}</span> : null}
    </div>
  );
}
