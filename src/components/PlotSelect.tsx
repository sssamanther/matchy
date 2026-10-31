import { PLOTS } from '../game/plots';

export default function PlotSelect({ onSelect, unlocked }: { onSelect: (i: number) => void; unlocked: number[] }) {
  return (
    <div style={{ padding: 16 }}>
      <h1>Choose a Plot</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLOTS.map((p, i) => {
          const isUnlocked = unlocked.includes(p.id);
          return (
            <button
              key={p.id}
              disabled={!isUnlocked}
              onClick={() => onSelect(i)}
              style={{ padding: 12, borderRadius: 8, opacity: isUnlocked ? 1 : 0.4 }}
            >
              {p.emoji} {p.name} — needs {p.starQuota} ⭐ {isUnlocked ? '' : '(locked)'}
            </button>
          );
        })}
      </div>
    </div>
  );
}