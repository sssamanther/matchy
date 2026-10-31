import { gardenLevel, GARDEN_LEVEL_THRESHOLDS } from '../game/progress';

export default function GardenLevelBar({ stars }: { stars: number }) {
  const level = gardenLevel(stars);
  const next = GARDEN_LEVEL_THRESHOLDS[level + 1] ?? stars;
  const prev = GARDEN_LEVEL_THRESHOLDS[level] ?? 0;
  const pct = next > prev ? ((stars - prev) / (next - prev)) * 100 : 100;
  return (
    <div style={{ marginTop: 8 }}>
      <div>Garden Level {level} — {stars} ⭐</div>
      <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#81c784' }} />
      </div>
    </div>
  );
}