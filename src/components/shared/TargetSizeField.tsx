export default function TargetSizeField({ value, unit, disabled, onValue, onUnit }: {
  value: string; unit: 'KB' | 'MB'; disabled?: boolean;
  onValue: (value: string) => void; onUnit: (unit: 'KB' | 'MB') => void;
}) {
  return <div className="local-media-field-row">
    <label className="local-media-field"><span>Target size (optional)</span><input type="number" min="0.01" step="any" placeholder="Use quality / preset" value={value} disabled={disabled} onChange={e => onValue(e.target.value)} /><small>A maximum size, not an exact size. Target mode may reduce quality.</small></label>
    <label className="local-media-field"><span>Size unit</span><select value={unit} disabled={disabled} onChange={e => onUnit(e.target.value as 'KB' | 'MB')}><option>KB</option><option>MB</option></select></label>
  </div>;
}
