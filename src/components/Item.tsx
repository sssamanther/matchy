import { CHAIN_EMOJI, CHAIN_TIER_LABELS } from '../game/types';
import type { Item as ItemType } from '../game/types';

export default function Item({ item }: { item: ItemType }) {
  return (
    <div
      draggable
      title={CHAIN_TIER_LABELS[item.chain][item.tier - 1]}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      <span>{CHAIN_EMOJI[item.chain]}</span>
      <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>{item.tier}</span>
    </div>
  );
}