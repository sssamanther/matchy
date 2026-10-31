import { CHAIN_EMOJI } from '../game/types';
import type { Order } from '../game/types';

export default function OrderPanel({
  orders,
  onServe,
}: {
  orders: Order[];
  onServe: (id: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {orders.map((o) => (
        <button
          key={o.id}
          onClick={() => onServe(o.id)}
          style={{
            padding: 8,
            borderRadius: 8,
            border: '1px solid #ccc',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          {CHAIN_EMOJI[o.chain]} x{o.count} (t{o.tier})
        </button>
      ))}
    </div>
  );
}