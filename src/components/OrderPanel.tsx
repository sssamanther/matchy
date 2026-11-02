import { useEffect, useRef, useState } from 'react';
import Art from './Art';
import { itemArt } from '../game/art';
import { CHAIN_EMOJI, CHAIN_TIER_LABELS } from '../game/types';
import type { Board, Order, OrderRequirement } from '../game/types';
import { canFulfill, countAvailable, rewardFor } from '../game/orders';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Short cozy title: "Froglet errand", "Froglet & Bud", "Froglet, Bud +1".
 * Kept as a pure helper (used by tests / potential future UI) — the order
 * cards themselves no longer render it; the required items identify orders.
 */
export function orderTitle(order: Order): string {
  const labels: string[] = [];
  for (const r of order.requirements) {
    const label = CHAIN_TIER_LABELS[r.chain]?.[r.tier - 1] ?? 'item';
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return 'Cozy errand';
  if (labels.length === 1) return `${capitalize(labels[0])} errand`;
  if (labels.length === 2) return `${capitalize(labels[0])} & ${capitalize(labels[1])}`;
  return `${capitalize(labels[0])}, ${capitalize(labels[1])} +${labels.length - 2}`;
}

const CARD_WIDTH = 150;

export default function OrderPanel({
  orders,
  board,
  onServe,
}: {
  orders: Order[];
  board: Board;
  onServe: (id: number) => void;
}) {
  const [reward, setReward] = useState<string | null>(null);
  const prevIdsRef = useRef(orders.map((o) => o.id));

  useEffect(() => {
    const prev = prevIdsRef.current;
    const changed = orders.some((o, i) => prev[i] !== o.id);
    if (changed) {
      setReward(`+${rewardFor(orders[0])} ⭐`); // approximate; rewards vary
      const t = setTimeout(() => setReward(null), 1200);
      prevIdsRef.current = orders.map((o) => o.id);
      return () => clearTimeout(t);
    }
    prevIdsRef.current = orders.map((o) => o.id);
  }, [orders]);

  return (
    <div style={{ position: 'relative' }}>
      {reward && (
        <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', color: '#2e7d32', fontWeight: 'bold', animation: 'pop 0.6s ease', fontSize: 12 }}>
          {reward}
        </div>
      )}
      {/* Horizontal card strip: fixed-width cards (no shrinking) scroll in
          place and leave the next card peeking to hint at more orders. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 }}>
        {orders.map((o) => {
          const ready = canFulfill(board, o);
          const stars = rewardFor(o);
          return (
            <div
              key={o.id}
              style={{
                width: CARD_WIDTH,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: 6,
                borderRadius: 10,
                border: ready ? '2px solid #4caf50' : '1px solid #ccc',
                background: ready ? '#e8f5e9' : '#fff',
                fontSize: 12,
                boxSizing: 'border-box',
              }}
            >
              {o.requirements.map((r: OrderRequirement, i: number) => {
                const have = countAvailable(board, r);
                const met = have >= r.count;
                const label = CHAIN_TIER_LABELS[r.chain]?.[r.tier - 1] ?? 'item';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      lineHeight: 1.3,
                      padding: '1px 2px',
                      borderRadius: 4,
                      background: met ? '#e8f5e9' : 'transparent',
                    }}
                  >
                    <Art
                      src={itemArt(r.chain, r.tier)}
                      alt={label}
                      emoji={CHAIN_EMOJI[r.chain]}
                      style={{ width: 20, height: 20, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontWeight: met ? 'bold' : 'normal',
                        color: met ? '#2e7d32' : '#555',
                      }}
                    >
                      {have}/{r.count}
                    </span>
                  </div>
                );
              })}
              <div style={{ color: '#f9a825', fontSize: 11, lineHeight: 1.3 }}>
                ⭐ +{stars} · ✨ +{stars} XP
              </div>
              <button
                disabled={!ready}
                onClick={() => onServe(o.id)}
                style={{
                  width: '100%',
                  marginTop: 'auto',
                  paddingTop: 5,
                  paddingBottom: 5,
                  borderRadius: 6,
                  border: 'none',
                  background: ready ? '#4caf50' : '#ddd',
                  color: ready ? '#fff' : '#888',
                  cursor: ready ? 'pointer' : 'not-allowed',
                  fontSize: 12,
                }}
              >
                Complete
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}
