import Art from './Art';
import { generatorArt } from '../game/art';
import { CHAIN_EMOJI } from '../game/types';
import type { ChainId } from '../game/types';
import { useRef } from 'react';

export default function Generator({ chain, onTap }: { chain: ChainId; onTap: () => void }) {
  const guard = useRef(false);
  return (
    <button
      onClick={() => {
        if (guard.current) return;
        guard.current = true;
        onTap();
        setTimeout(() => { guard.current = false; }, 300);
      }}
      style={{
        width: '100%',
        height: '100%',
        fontSize: 24,
        borderRadius: 8,
        border: '2px dashed #81c784',
        background: '#f1f8e9',
        cursor: 'pointer',
      }}
    >
      <Art
        src={generatorArt(chain)}
        alt={`${chain} generator`}
        emoji={CHAIN_EMOJI[chain]}
        style={{ width: '100%', height: '100%' }}
      />
    </button>
  );
}