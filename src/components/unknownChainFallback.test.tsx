import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Item from './Item';
import ItemInfoBar from './ItemInfoBar';
import Generator from './Generator';
import OrderPanel from './OrderPanel';
import StorageView from './StorageView';
import { chainEmoji, tierLabel, type ChainId, type Item as ItemType, type Order } from '../game/types';

/**
 * Phase 0 save-safety: saves are validated for *shape* only (any string
 * chain, any numeric tier passes), so the UI must degrade to placeholders for
 * identities this build does not recognize instead of crashing the board.
 */

const ghostItem = { id: 1, chain: 'ghost', tier: 3 } as unknown as ItemType;
const oddTierItem = { id: 2, chain: 'frog', tier: 9 } as unknown as ItemType;

describe('chain label / emoji helpers', () => {
  it('returns the proper name for a known chain and tier', () => {
    expect(tierLabel('frog', 3)).toBe('Frog');
    expect(tierLabel('flower', 5)).toBe('Bouquet');
    expect(tierLabel('berry', 5)).toBe('Berry Basket');
  });

  it('returns a neutral placeholder for an unknown chain', () => {
    expect(tierLabel('ghost', 3)).toBe('Item');
  });

  it('returns a tier placeholder instead of undefined for out-of-range tiers', () => {
    expect(tierLabel('frog', 9)).toBe('Tier 9');
    expect(tierLabel('frog', 0)).toBe('Tier 0');
    expect(tierLabel('frog', Number.NaN)).toBe('Tier 0');
  });

  it('returns the emoji for known chains and a neutral one otherwise', () => {
    expect(chainEmoji('frog')).toBe('🐸');
    expect(chainEmoji('ghost')).toBe('❓');
  });
});

describe('board and panels tolerate unknown chains and tiers', () => {
  it('Item renders an unknown chain with a placeholder label and emoji', () => {
    const html = renderToStaticMarkup(<Item item={ghostItem} />);
    expect(html).toContain('title="Item (tier 3)"');
    expect(html).toContain('❓');
  });

  it('Item renders an out-of-range tier without crashing', () => {
    const html = renderToStaticMarkup(<Item item={oddTierItem} />);
    expect(html).toContain('title="Tier 9 (tier 9)"');
  });

  it('ItemInfoBar renders an unknown chain item', () => {
    const html = renderToStaticMarkup(
      <ItemInfoBar item={ghostItem} storageFull={false} onStore={() => {}} />,
    );
    expect(html).toContain('Item'); // placeholder name
    // JSX text/expression boundaries render as <!-- --> in static markup
    expect(html.replace(/<!-- -->/g, '')).toContain('Ghost · Tier 3 of 5');
    expect(html).toContain('❓'); // emoji fallback instead of an empty box
  });

  it('StorageView renders a slot holding an unknown chain item', () => {
    const slots: (ItemType | null)[] = [ghostItem, ...new Array<ItemType | null>(7).fill(null)];
    const html = renderToStaticMarkup(
      <StorageView
        slots={slots}
        capacity={8}
        boardFull={false}
        onRetrieve={() => {}}
        onBack={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Item (slot 1)"');
    expect(html.replace(/<!-- -->/g, '')).toContain('1/8 used');
  });

  it('OrderPanel renders a requirement for an unknown chain', () => {
    const ghostOrder = {
      id: 1,
      requirements: [{ chain: 'ghost', tier: 2, count: 1 }],
    } as unknown as Order;
    const html = renderToStaticMarkup(
      <OrderPanel orders={[ghostOrder]} board={[]} onServe={() => {}} />,
    );
    expect(html).toContain('Item'); // placeholder requirement name
    expect(html).toContain('❓');
    expect(html).not.toContain('undefined');
  });

  it('Generator renders an unknown chain with the neutral emoji', () => {
    const html = renderToStaticMarkup(
      <Generator chain={'ghost' as unknown as ChainId} onTap={() => {}} />,
    );
    expect(html).toContain('❓');
  });
});
