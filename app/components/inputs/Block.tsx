export function Block({ title, note, action, info, children }: { title: string; note?: string; action?: React.ReactNode; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="block">
      <header className="block-head">
        <h3>{title}</h3>
        {info}
        {note ? <span className="block-note">{note}</span> : null}
        {action}
      </header>
      {children}
    </section>
  );
}
