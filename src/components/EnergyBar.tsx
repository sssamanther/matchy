import { useEffect, useState } from 'react';

export default function EnergyBar({
  energy,
  maxEnergy,
  energyUpdatedAt,
}: {
  energy: number;
  maxEnergy: number;
  energyUpdatedAt: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const full = energy >= maxEnergy;
  const regen = regenerateCountdown(energy, energyUpdatedAt, now, maxEnergy);
  const pct = (energy / maxEnergy) * 100;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>⚡ Energy: {energy} / {maxEnergy}</span>
        <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#fbc02d' }} />
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        {full ? 'Full' : `Next energy in ${formatTime(regen)}`}
        {energy === 0 && ' — energy regenerates automatically'}
      </div>
    </div>
  );
}

function regenerateCountdown(energy: number, updatedAt: number, now: number, max: number): number {
  if (energy >= max) return 0;
  const elapsed = now - updatedAt;
  const remaining = 60000 - (elapsed % 60000);
  return Math.max(0, remaining);
}

function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}