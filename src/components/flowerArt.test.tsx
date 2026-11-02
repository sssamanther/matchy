/**
 * Flower artwork integration tests — the right illustration and display name
 * must appear on the board, generator/source controls and the order panel,
 * always keyed by chain+tier (never by display name), while other chains
 * keep their emoji fallbacks and existing saves keep working.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Generator from './Generator';
import Item from './Item';
import OrderPanel, { orderTitle } from './OrderPanel';
import Source from './Source';
import { createInitialState, toPersisted } from '../game/state';
import type { Board, Order } from '../game/types';

const EMPTY_BOARD: Board = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => null));

const FLOWER_TIERS: Array<{ tier: number; path: string; name: string }> = [
  { tier: 1, path: '/assets/items/flower-1-seed.png', name: 'Seed' },
  { tier: 2, path: '/assets/items/flower-2-sprout.png', name: 'Sprout' },
  { tier: 3, path: '/assets/items/flower-3-bud.png', name: 'Bud' },
  { tier: 4, path: '/assets/items/flower-4-blossom.png', name: 'Blossom' },
  { tier: 5, path: '/assets/items/flower-5-bouquet.png', name: 'Bouquet' },
];

describe('merge board items', () => {
  it('renders every flower tier with its own illustration, name and tier badge', () => {
    for (const { tier, path, name } of FLOWER_TIERS) {
      const html = renderToStaticMarkup(<Item item={{ id: tier, chain: 'flower', tier }} />);
      expect(html, `tier ${tier}`).toContain(`src="${path}"`);
      expect(html, `tier ${tier}`).toContain(`alt="${name}"`);
      expect(html, `tier ${tier}`).toContain(`title="${name}"`);
      expect(html, `tier ${tier}`).toContain(`>${tier}</span>`); // tier badge preserved
    }
  });

  it('keeps non-flower items on their emoji fallback', () => {
    const html = renderToStaticMarkup(<Item item={{ id: 9, chain: 'frog', tier: 3 }} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('🐸');
    expect(html).toContain('aria-label="froglet"');
    expect(html).toContain('>3</span>');
  });

  it('never gives a Berry item flower artwork (shared "Blossom" name)', () => {
    const html = renderToStaticMarkup(<Item item={{ id: 10, chain: 'berry', tier: 2 }} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('🫐');
    expect(html).toContain('title="blossom"'); // berry's own name, unchanged
    expect(html).not.toContain('flower-4-blossom.png');
  });
});

describe('generator and source controls', () => {
  it('shows the flower generator illustration on the board and in source controls', () => {
    const gen = renderToStaticMarkup(<Generator chain="flower" onTap={() => {}} />);
    expect(gen).toContain('src="/assets/generators/flower.png"');
    const src = renderToStaticMarkup(<Source chain="flower" onTap={() => {}} />);
    expect(src).toContain('src="/assets/generators/flower.png"');
  });

  it('keeps the emoji for chains without generator artwork', () => {
    expect(renderToStaticMarkup(<Generator chain="frog" onTap={() => {}} />)).toContain('🐸');
    expect(renderToStaticMarkup(<Source chain="mushroom" onTap={() => {}} />)).toContain('🍄');
  });
});

describe('order panel artwork and names', () => {
  it('shows the right illustration and name for each requirement in a multi-item order', () => {
    const order: Order = {
      id: 1,
      requirements: [
        { chain: 'flower', tier: 2, count: 1 },
        { chain: 'flower', tier: 5, count: 2 },
        { chain: 'berry', tier: 4, count: 1 },
      ],
    };
    const html = renderToStaticMarkup(<OrderPanel orders={[order]} board={EMPTY_BOARD} onServe={() => {}} />);
    // flower requirements: illustration + display name each
    expect(html).toContain('src="/assets/items/flower-2-sprout.png"');
    expect(html).toContain('src="/assets/items/flower-5-bouquet.png"');
    expect(html).toContain('>Sprout<');
    expect(html).toContain('>Bouquet<');
    // non-flower requirement keeps its emoji and name
    expect(html).toContain('🫐');
    expect(html).toContain('>ripe berry<');
  });

  it('titles use the new flower names and remain chain-aware', () => {
    expect(orderTitle({ id: 1, requirements: [{ chain: 'flower', tier: 4, count: 1 }] })).toBe('Blossom errand');
    expect(orderTitle({ id: 2, requirements: [{ chain: 'flower', tier: 5, count: 1 }] })).toBe('Bouquet errand');
    expect(
      orderTitle({ id: 3, requirements: [
        { chain: 'flower', tier: 4, count: 1 },
        { chain: 'flower', tier: 2, count: 1 },
      ] }),
    ).toBe('Blossom & Sprout');
    // berry's own "blossom" still titles from berry's unchanged label
    expect(orderTitle({ id: 4, requirements: [{ chain: 'berry', tier: 2, count: 1 }] })).toBe('Blossom errand');
  });

  it('does not put flower artwork on a berry order that asks for "blossom"', () => {
    const order: Order = { id: 5, requirements: [{ chain: 'berry', tier: 2, count: 1 }] };
    const html = renderToStaticMarkup(<OrderPanel orders={[order]} board={EMPTY_BOARD} onServe={() => {}} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('aria-label="blossom"');
  });
});

describe('saved data compatibility', () => {
  it('persists no display names — only chain/tier/count — so old saves render new names', () => {
    const s0 = createInitialState(null, 1_000);
    const persisted = toPersisted(s0);
    for (const o of persisted.orders) {
      expect(Object.keys(o).sort()).toEqual(['id', 'requirements']);
      for (const r of o.requirements) {
        expect(Object.keys(r).sort()).toEqual(['chain', 'count', 'tier']);
      }
    }
    expect(JSON.stringify(persisted)).not.toContain('Blossom');
    expect(JSON.stringify(persisted)).not.toContain('Bouquet');
  });

  it('loads an existing save with flower orders and renders the new art and names', () => {
    const base = createInitialState(null, 1_000);
    const saved = {
      ...toPersisted(base),
      orders: [{ id: 42, requirements: [{ chain: 'flower' as const, tier: 4, count: 1 }] }],
    };
    const loaded = createInitialState(saved, 1_000);
    // item/order identity preserved: chain + tier untouched
    expect(loaded.orders).toContainEqual({ id: 42, requirements: [{ chain: 'flower', tier: 4, count: 1 }] });
    const html = renderToStaticMarkup(<OrderPanel orders={loaded.orders} board={loaded.board} onServe={() => {}} />);
    expect(html).toContain('src="/assets/items/flower-4-blossom.png"');
    expect(html).toContain('Blossom');
    // and the round trip through storage still works unchanged
    expect(toPersisted(loaded).orders).toEqual(saved.orders);
  });
});
