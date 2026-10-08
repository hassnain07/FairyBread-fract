export function Toggle({ on, onToggle, label, sublabel }: { on: boolean; onToggle: () => void; label: string; sublabel?: string }) {
  return (
    <button className="toggle-row" onClick={onToggle}>
      <div>
        <strong>{label}</strong>
        {sublabel && <span>{sublabel}</span>}
      </div>
      <span className={`toggle ${on ? 'on' : ''}`}><i /></span>
    </button>
  );
}
