import Art from './Art';
import { generatorArt } from '../game/art';
import { chainEmoji, generatorName } from '../game/types';
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
        padding: 4,
        boxSizing: 'border-box',
      }}
    >
      <Art
        src={generatorArt(chain)}
        alt={generatorName(chain)}
        emoji={chainEmoji(chain)}
        style={{ width: '100%', height: '100%' }}
      />
    </button>
  );
}
