import Art from './Art';
import { itemArt } from '../game/art';
import { CHAIN_TIER_COUNT, chainEmoji, tierLabel, type ChainId, type Item } from '../game/types';

/** Capitalised display name for a chain (e.g. frog -> "Frog"). */
function chainName(chain: ChainId): string {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

/**
 * Compact information bar directly beneath the board (above the Board /
 * Storage / Garden buttons): illustration, item name, chain, tier, the Store
 * action, and a disabled Collection placeholder for a later phase.
 *
 * Rendered by App only while a regular item is selected, so it collapses to
 * zero height whenever the selection is cleared.
 */
export default function ItemInfoBar({
  item,
  storageFull,
  onStore,
}: {
  item: Item;
  storageFull: boolean;
  onStore: () => void;
}) {
  const label = tierLabel(item.chain, item.tier);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        padding: '6px 8px',
        background: '#e8f5e9',
        border: '1px solid #c8e6c9',
        borderRadius: 10,
        minWidth: 0,
      }}
    >
      <Art
        src={itemArt(item.chain, item.tier)}
        alt={label}
        emoji={chainEmoji(item.chain)}
        style={{ width: 26, height: 26, flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#555' }}>
          {chainName(item.chain)} · Tier {item.tier} of {CHAIN_TIER_COUNT}
        </div>
      </div>
      <button
        onClick={onStore}
        disabled={storageFull}
        title={storageFull ? 'Storage full' : 'Move this item to storage'}
        style={{
          fontSize: 12,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid #a5d6a7',
          background: '#fff',
          color: '#2e7d32',
          fontWeight: 600,
          cursor: storageFull ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        📦 Store
      </button>
      <button
        disabled
        title="Collection — Coming Soon"
        style={{
          fontSize: 12,
          padding: '4px 8px',
          borderRadius: 8,
          border: '1px solid #c8e6c9',
          background: '#f5f5f5',
          color: '#777',
          opacity: 0.7,
          cursor: 'default',
          flexShrink: 0,
          lineHeight: 1.2,
        }}
      >
        Collection
        <span style={{ display: 'block', fontSize: 9, color: '#999' }}>Coming Soon</span>
      </button>
    </div>
  );
}
