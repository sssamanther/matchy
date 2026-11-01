import { useEffect, useState } from 'react';
// DEV-ONLY (temporary): debug tooling gate — see src/dev/devTools.ts
import { isDevToolsEnabled } from '../dev/devTools';

export default function EnergyBar({
  energy,
  maxEnergy,
  energyUpdatedAt,
  onDevRefill,
}: {
  energy: number;
  maxEnergy: number;
  energyUpdatedAt: number;
  /** DEV-ONLY (temporary): debug refill button handler; hidden unless dev tools are enabled. */
  onDevRefill?: () => void;
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
        {/* DEV-ONLY (temporary): debug refill — see src/dev/devTools.ts.
            The static build flag is deliberately first: in a release build it
            folds to `false` and esbuild compiles this button out entirely.
            The runtime gate (isDevToolsEnabled) carries the shared logic. */}
        {(__LITTLEWINDS_DEV_TOOLS__ || import.meta.env.DEV) && onDevRefill && isDevToolsEnabled() && (
          <button
            type="button"
            data-testid="dev-refill-energy"
            title="DEV ONLY: instantly refill energy"
            onClick={onDevRefill}
            style={{
              fontSize: 11,
              padding: '2px 6px',
              border: '1px dashed #f57c00',
              borderRadius: 4,
              background: '#fff3e0',
              color: '#e65100',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ⚡ DEV Refill
          </button>
        )}
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