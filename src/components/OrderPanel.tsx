import { useEffect, useRef, useState } from 'react';
import { CHAIN_EMOJI, CHAIN_TIER_LABELS } from '../game/types';
import type { Board, Order, OrderRequirement } from '../game/types';
import { canFulfill, countAvailable, rewardFor } from '../game/orders';

function reqProgress(board: Board, req: OrderRequirement): number {
  return countAvailable(board, req);
}

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
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {orders.map((o) => {
          const ready = canFulfill(board, o);
          return (
            <div
              key={o.id}
              style={{
                minWidth: 150,
                flexShrink: 0,
                padding: 6,
                borderRadius: 8,
                border: ready ? '2px solid #4caf50' : '1px solid #ccc',
                background: ready ? '#e8f5e9' : '#fff',
                fontSize: 12,
              }}
            >
              {o.requirements.map((r, i) => {
                const have = reqProgress(board, r);
                return (
                  <div key={i}>
                    {CHAIN_EMOJI[r.chain]} {CHAIN_TIER_LABELS[r.chain][r.tier - 1]} · T{r.tier} — {have}/{r.count}
                  </div>
                );
              })}
              <div style={{ color: '#f9a825' }}>⭐ +{rewardFor(o)}</div>
              {ready && <div style={{ color: '#2e7d32', fontWeight: 'bold' }}>Ready! ✓</div>}
              <button
                disabled={!ready}
                onClick={() => onServe(o.id)}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: 4,
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