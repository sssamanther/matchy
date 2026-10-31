import { useEffect, useRef, useState } from 'react';
import { CHAIN_EMOJI, CHAIN_TIER_LABELS } from '../game/types';
import type { Board, Order } from '../game/types';
import { canFulfill } from '../game/orders';

function collected(board: Board, order: Order): number {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && 'tier' in cell && cell.chain === order.chain && cell.tier === order.tier) n++;
  }
  return n;
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
      setReward('+1 ⭐');
      const t = setTimeout(() => setReward(null), 1200);
      prevIdsRef.current = orders.map((o) => o.id);
      return () => clearTimeout(t);
    }
    prevIdsRef.current = orders.map((o) => o.id);
  }, [orders]);

  return (
    <div style={{ position: 'relative' }}>
      {reward && (
        <div
          style={{
            position: 'absolute',
            top: -24,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#2e7d32',
            fontWeight: 'bold',
            animation: 'pop 0.6s ease',
          }}
        >
          {reward}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {orders.map((o) => {
          const have = collected(board, o);
          const ready = have >= o.count;
          return (
            <div
              key={o.id}
              style={{
                flex: '1 1 140px',
                minWidth: 140,
                padding: 12,
                borderRadius: 12,
                border: ready ? '2px solid #4caf50' : '1px solid #ccc',
                background: ready ? '#e8f5e9' : '#fff',
                transition: 'background 0.2s, border 0.2s',
              }}
            >
              <div style={{ fontSize: 28, textAlign: 'center' }}>
                {CHAIN_EMOJI[o.chain]}
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.7 }}>
                {CHAIN_TIER_LABELS[o.chain][o.tier - 1]} (tier {o.tier})
              </div>
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                Need: {o.count}
              </div>
              <div style={{ textAlign: 'center', fontSize: 12 }}>
                {have}/{o.count} collected
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#f9a825' }}>
                Reward: +1 ⭐
              </div>
              {ready && (
                <div style={{ textAlign: 'center', color: '#2e7d32', fontWeight: 'bold' }}>
                  Ready! ✓
                </div>
              )}
              <button
                disabled={!ready || !canFulfill(board, o)}
                onClick={() => onServe(o.id)}
                style={{
                  width: '100%',
                  marginTop: 8,
                  padding: 6,
                  borderRadius: 8,
                  border: 'none',
                  background: ready ? '#4caf50' : '#ddd',
                  color: ready ? '#fff' : '#888',
                  cursor: ready ? 'pointer' : 'not-allowed',
                }}
              >
                Complete Order
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