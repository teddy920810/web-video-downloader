export const BACKGROUND_COLORS = [
  ['transparent', 'Transparent'], ['#ffffff', 'White'], ['#111827', 'Black'],
  ['#f3f4f6', 'Light gray'], ['#ef4444', 'Red'], ['#f59e0b', 'Orange'],
  ['#22c55e', 'Green'], ['#3b82f6', 'Blue'], ['#8b5cf6', 'Purple'],
] as const;

export default function ColorSwatches({ value, onChange, disabled, label = 'Background color', transparent = true }: {
  value: string; onChange: (color: string) => void; disabled?: boolean; label?: string; transparent?: boolean;
}) {
  return <fieldset className="color-picker" disabled={disabled}><legend>{label}</legend>
    <div className="color-picker-options">{BACKGROUND_COLORS.filter(([color]) => transparent || color !== 'transparent').map(([color, name]) =>
      <button type="button" key={color} aria-pressed={value === color} onClick={() => onChange(color)} className={value === color ? 'is-selected' : ''}>
        <span className={color === 'transparent' ? 'color-chip checkerboard' : 'color-chip'} style={color === 'transparent' ? undefined : { background: color }} aria-hidden="true" />
        <span>{name}</span>{value === color ? <span aria-hidden="true">✓</span> : null}
      </button>)}</div>
  </fieldset>;
}
