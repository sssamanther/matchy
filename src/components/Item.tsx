import Art from './Art';
import { itemArt } from '../game/art';
import { CHAIN_EMOJI, CHAIN_TIER_LABELS } from '../game/types';
import type { Item as ItemType } from '../game/types';

/**
 * Board tile for a mergeable item. No visible tier badge — the illustration
 * fills ~88% of the tile — while the tier stays available non-visually in
 * the tooltip (useful metadata for emoji and illustrated chains alike).
 */
export default function Item({ item }: { item: ItemType }) {
  const label = CHAIN_TIER_LABELS[item.chain][item.tier - 1];
  return (
    <div
      title={`${label} (tier ${item.tier})`}
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
      <Art
        src={itemArt(item.chain, item.tier)}
        alt={label}
        emoji={CHAIN_EMOJI[item.chain]}
        style={{ width: '88%', height: '88%' }}
      />
    </div>
  );
}
