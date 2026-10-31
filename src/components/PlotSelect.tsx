import { PLOTS } from '../game/plots';

export default function PlotSelect({ onSelect }: { onSelect: (i: number) => void }) {
  return (
    <div style={{ padding: 16 }}>
      <h1>Choose a Plot</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLOTS.map((p, i) => (
          <button key={p.id} onClick={() => onSelect(i)} style={{ padding: 12, borderRadius: 8 }}>
            {p.emoji} {p.name} — needs {p.starQuota} ⭐
          </button>
        ))}
      </div>
    </div>
  );
}