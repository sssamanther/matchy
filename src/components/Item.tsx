import Art from './Art';
import { itemArt } from '../game/art';
import { CHAIN_EMOJI, CHAIN_TIER_LABELS } from '../game/types';
import type { Item as ItemType } from '../game/types';

export default function Item({ item }: { item: ItemType }) {
  const label = CHAIN_TIER_LABELS[item.chain][item.tier - 1];
  return (
    <div
      title={label}
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      <Art
        src={itemArt(item.chain, item.tier)}
        alt={label}
        emoji={CHAIN_EMOJI[item.chain]}
        style={{ flex: 1, minWidth: 0, height: '100%' }}
      />
      <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>{item.tier}</span>
    </div>
  );
}
