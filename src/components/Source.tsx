import { CHAIN_EMOJI } from '../game/types';
import type { ChainId } from '../game/types';

export default function Source({ chain, onTap }: { chain: ChainId; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      style={{
        width: 56,
        height: 56,
        fontSize: 24,
        borderRadius: 12,
        border: '2px solid #81c784',
        background: '#f1f8e9',
        cursor: 'pointer',
      }}
    >
      {CHAIN_EMOJI[chain]}
    </button>
  );
}