type Props = {
  label: string;
  progress?: number;
  inline?: boolean;
};

export default function ProcessingOverlay({ label, progress, inline = false }: Props) {
  const normalized = typeof progress === 'number'
    ? Math.max(0, Math.min(1, progress))
    : null;

  return (
    <div
      className={`tool-processing-overlay${inline ? ' is-inline' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="tool-processing-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      {normalized === null ? null : (
        <>
          <span>{Math.round(normalized * 100)}%</span>
          <progress max="1" value={normalized} aria-label={label} />
        </>
      )}
    </div>
  );
}
