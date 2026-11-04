import { useState } from 'react';
import Item from './Item';
import { CHAIN_TIER_COUNT, tierLabel, type Item as ItemType } from '../game/types';

/**
 * Full-screen storage view (opened from the main interface): 8 clearly
 * defined slots in a narrow-screen-friendly 4-column grid, used-capacity
 * readout, tap-a-slot selection and a Retrieve action that moves the item to
 * the first free board tile (refused while the board is full — the item
 * always stays safely in its slot).
 */
export default function StorageView({
  slots,
  capacity,
  boardFull,
  onRetrieve,
  onBack,
}: {
  slots: (ItemType | null)[];
  capacity: number;
  boardFull: boolean;
  onRetrieve: (index: number) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const used = slots.reduce((n, s) => (s === null ? n : n + 1), 0);
  const selectedItem: ItemType | null =
    selected !== null ? slots[selected] ?? null : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', padding: 16, overflowY: 'auto', zIndex: 100 }}>
      <h3 style={{ marginTop: 0 }}>📦 Storage</h3>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        {used}/{capacity} used
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {slots.map((slot, i) => {
          const isSel = selected === i && slot !== null;
          return (
            <button
              key={i}
              onClick={() => setSelected(slot && !isSel ? i : null)}
              aria-label={
                slot
                  ? `${tierLabel(slot.chain, slot.tier)} (slot ${i + 1})`
                  : `Empty slot ${i + 1}`
              }
              style={{
                aspectRatio: '1 / 1',
                padding: 4,
                background: slot ? '#fff' : '#fafafa',
                borderRadius: 10,
                border: isSel ? '2px solid #ffb74d' : '1px dashed #c8e6c9',
                boxShadow: isSel ? '0 0 0 2px #ffe082' : 'none',
                cursor: slot ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 0,
              }}
            >
              {slot ? <Item item={slot} /> : <span style={{ opacity: 0.3, fontSize: 18 }}>＋</span>}
            </button>
          );
        })}
      </div>
      {selectedItem && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            padding: '8px 10px',
            background: '#e8f5e9',
            border: '1px solid #c8e6c9',
            borderRadius: 10,
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {tierLabel(selectedItem.chain, selectedItem.tier)}
            </div>
            <div style={{ fontSize: 11, color: '#555' }}>
              Tier {selectedItem.tier} of {CHAIN_TIER_COUNT}
              {boardFull ? ' · Board is full' : ''}
            </div>
          </div>
          <button
            onClick={() => {
              onRetrieve(selected!);
              setSelected(null);
            }}
            disabled={boardFull}
            title={boardFull ? 'Free a board tile first' : 'Move to the first free board tile'}
            style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #a5d6a7',
              background: '#fff',
              color: '#2e7d32',
              fontWeight: 600,
              cursor: boardFull ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            ⬅ Retrieve
          </button>
        </div>
      )}
      <button onClick={onBack} style={{ marginTop: 14 }}>Back</button>
    </div>
  );
}
