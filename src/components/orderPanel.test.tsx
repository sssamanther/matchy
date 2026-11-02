// @vitest-environment jsdom
/**
 * Compact order card redesign tests — requirement rows, fixed-width
 * horizontally scrolling cards, bottom-anchored Complete buttons, artwork
 * keyed by chain+tier, fulfilled-state styling, and unchanged completion
 * behavior.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// React requires this flag for act()-based updates outside of a test renderer.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import OrderPanel from './OrderPanel';
import { rewardFor } from '../game/orders';
import type { Board, Cell, ChainId, Order } from '../game/types';

function emptyBoard(): Board {
  return Array.from({ length: 7 }, () => Array.from({ length: 7 }, (): Cell => null));
}

function boardWith(items: Array<{ chain: ChainId; tier: number }>): Board {
  const b = emptyBoard();
  items.forEach((it, i) => {
    b[0][i] = { id: 500 + i, ...it };
  });
  return b;
}

function renderPanel(orders: Order[], board: Board = emptyBoard(), onServe = () => {}) {
  return renderToStaticMarkup(<OrderPanel orders={orders} board={board} onServe={onServe} />);
}

/** One requirement row renders one `have/count` span. */
function countRows(html: string): number {
  return (html.match(/>[0-9]+\/[0-9]+<\/span>/g) ?? []).length;
}

const ONE: Order = { id: 1, requirements: [{ chain: 'frog', tier: 1, count: 2 }] };
const TWO: Order = {
  id: 2,
  requirements: [
    { chain: 'flower', tier: 2, count: 1 },
    { chain: 'berry', tier: 4, count: 2 },
  ],
};
const THREE: Order = {
  id: 3,
  requirements: [
    { chain: 'mushroom', tier: 1, count: 1 },
    { chain: 'frog', tier: 2, count: 1 },
    { chain: 'flower', tier: 5, count: 1 },
  ],
};

describe('requirement rows', () => {
  it('renders one compact row per requirement for 1, 2 and 3+ requirement orders', () => {
    expect(countRows(renderPanel([ONE]))).toBe(1);
    expect(countRows(renderPanel([TWO]))).toBe(2);
    expect(countRows(renderPanel([THREE]))).toBe(3);
  });

  it('no longer renders generated order titles', () => {
    const html = renderPanel([{ id: 9, requirements: [{ chain: 'flower', tier: 5, count: 1 }] }]);
    expect(html).not.toContain('errand'); // orderTitle output is hidden
    expect(html).not.toContain(' & '); // two-label titles are hidden
    // the requirement itself still names the item
    expect(html).toContain('Bouquet');
  });

  it('shows illustration or emoji per row, selected by chain+tier', () => {
    const html = renderPanel([TWO]);
    // flower tier 2 gets its illustration; berry keeps the emoji fallback
    expect(html).toContain('src="/assets/items/flower-2-sprout.png"');
    expect(html).toContain('alt="Sprout"');
    expect(html).toContain('\u{1FAD0}'); // blueberry emoji for berry
    expect(html).toContain('aria-label="ripe berry"');
    expect(html).toContain('Sprout');
    expect(html).toContain('ripe berry');
  });

  it('applies a subtle completed state to fulfilled requirements', () => {
    const order: Order = {
      id: 4,
      requirements: [
        { chain: 'flower', tier: 2, count: 1 }, // met
        { chain: 'berry', tier: 4, count: 1 }, // unmet
      ],
    };
    const html = renderPanel([order], boardWith([{ chain: 'flower', tier: 2 }]));
    // met: green bold count + light green row tint
    expect(html).toContain('font-weight:bold;color:#2e7d32');
    expect(html).toContain('border-radius:4px;background:#e8f5e9');
    // unmet: muted count, transparent row
    expect(html).toContain('font-weight:normal;color:#555');
    expect(html).toContain('border-radius:4px;background:transparent');
  });
});

describe('card layout', () => {
  it('uses fixed-width, non-shrinking vertical cards (one per order)', () => {
    const html = renderPanel([ONE, TWO, THREE]);
    // React serializes the card style props in declaration order
    const sig = 'width:150px;flex-shrink:0;display:flex;flex-direction:column';
    const matches = html.split(sig).length - 1;
    expect(matches).toBe(3);
  });

  it('scrolls the card strip horizontally instead of wrapping', () => {
    const html = renderPanel([ONE, TWO, THREE]);
    expect(html).toContain('display:flex;gap:6px;align-items:stretch;overflow-x:auto');
    expect(html).not.toContain('flex-wrap'); // never wraps to multiple rows
  });

  it('bottom-anchors every Complete button regardless of requirement count', () => {
    const html = renderPanel([ONE, THREE]); // 1 vs 3 requirements
    const buttons = html.split('width:100%;margin-top:auto').length - 1;
    expect(buttons).toBe(2);
    expect(html).toContain('align-items:stretch'); // equal card heights
  });

  it('keeps rewards compact and intact (Stars + XP together)', () => {
    const html = renderPanel([ONE]);
    expect(html).toContain(`⭐ +${rewardFor(ONE)} · ✨ +${rewardFor(ONE)} XP`);
  });
});

describe('completion behavior (unchanged)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  async function mount(node: ReactElement): Promise<HTMLDivElement> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(node);
    });
    return container;
  }

  function completeButton(c: HTMLDivElement): HTMLButtonElement {
    const btn = Array.from(c.querySelectorAll('button')).find(
      (b) => b.textContent === 'Complete',
    );
    expect(btn).toBeDefined();
    return btn!;
  }

  afterEach(async () => {
    if (root) {
      const r = root;
      await act(async () => r.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('disables Complete while requirements are unmet', async () => {
    const c = await mount(<OrderPanel orders={[ONE]} board={emptyBoard()} onServe={() => {}} />);
    expect(completeButton(c).disabled).toBe(true);
  });

  it('enables Complete and serves the correct order id when requirements are met', async () => {
    const onServe = vi.fn();
    const order: Order = { id: 42, requirements: [{ chain: 'frog', tier: 1, count: 1 }] };
    const c = await mount(
      <OrderPanel orders={[order]} board={boardWith([{ chain: 'frog', tier: 1 }])} onServe={onServe} />,
    );
    const btn = completeButton(c);
    expect(btn.disabled).toBe(false);
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onServe).toHaveBeenCalledTimes(1);
    expect(onServe).toHaveBeenCalledWith(42);
  });

  it('never serves from a disabled button', async () => {
    const onServe = vi.fn();
    const c = await mount(<OrderPanel orders={[ONE]} board={emptyBoard()} onServe={onServe} />);
    await act(async () => {
      completeButton(c).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onServe).not.toHaveBeenCalled();
  });
});
