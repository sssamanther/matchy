// @vitest-environment jsdom
/**
 * Selected-item information bar and storage view rendering: artwork via the
 * shared Art component, name/chain/tier text, Store + disabled Collection
 * actions, 8-slot grid with capacity readout, slot selection and Retrieve
 * (including the board-full refusal).
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// React requires this flag for act()-based updates outside of a test renderer.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import ItemInfoBar from './ItemInfoBar';
import StorageView from './StorageView';
import type { Item } from '../game/types';

function buttonByText(c: ParentNode, text: string): HTMLButtonElement {
  const btn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  expect(btn, `button "${text}"`).toBeDefined();
  return btn!;
}

// ---------------------------------------------------------------------------
// ItemInfoBar
// ---------------------------------------------------------------------------

describe('selected-item information bar', () => {
  it('shows illustration, item name, chain and tier for an illustrated item', () => {
    const html = renderToStaticMarkup(
      <ItemInfoBar item={{ id: 1, chain: 'flower', tier: 4 }} storageFull={false} onStore={() => {}} />,
    );
    expect(html).toContain('src="/assets/items/flower-4-blossom.png"');
    expect(html).toContain('alt="Blossom"');
    expect(html).toContain('>Blossom<'); // item display name
    expect(html).toContain('Flower · Tier 4 of 5'); // chain name + tier number
    expect(html).toContain('📦 Store');
    expect(html).toContain('Coming Soon'); // Collection placeholder marker
  });

  it('keeps the emoji fallback for chains without artwork', () => {
    const html = renderToStaticMarkup(
      <ItemInfoBar item={{ id: 2, chain: 'berry', tier: 3 }} storageFull={false} onStore={() => {}} />,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('\u{1FAD0}'); // berry emoji
    expect(html).toContain('>green berry<');
    expect(html).toContain('Berry · Tier 3 of 5');
  });

  it('renders both actions as buttons, Collection disabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ItemInfoBar item={{ id: 3, chain: 'frog', tier: 1 }} storageFull={false} onStore={() => {}} />,
      );
    });
    const store = buttonByText(container, 'Store');
    const collection = buttonByText(container, 'Collection');
    expect(store.disabled).toBe(false);
    expect(collection.disabled).toBe(true);
    expect(collection.textContent).toContain('Coming Soon');
    await act(async () => root.unmount());
    container.remove();
  });

  it('fires onStore from the Store button', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onStore = vi.fn();
    await act(async () => {
      root.render(<ItemInfoBar item={{ id: 4, chain: 'frog', tier: 1 }} storageFull={false} onStore={onStore} />);
    });
    await act(async () => {
      buttonByText(container, 'Store').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onStore).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    container.remove();
  });

  it('disables Store when storage is full', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onStore = vi.fn();
    await act(async () => {
      root.render(<ItemInfoBar item={{ id: 5, chain: 'frog', tier: 1 }} storageFull onStore={onStore} />);
    });
    const store = buttonByText(container, 'Store');
    expect(store.disabled).toBe(true);
    await act(async () => {
      store.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onStore).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});

// ---------------------------------------------------------------------------
// StorageView
// ---------------------------------------------------------------------------

describe('storage view', () => {
  const empty = (): (Item | null)[] => new Array(8).fill(null);

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

  afterEach(async () => {
    if (root) {
      const r = root;
      await act(async () => r.unmount());
    }
    container?.remove();
    container = null;
    root = null;
  });

  it('renders exactly 8 clearly defined slots with a 0/8 capacity readout', async () => {
    const c = await mount(
      <StorageView slots={empty()} capacity={8} boardFull={false} onRetrieve={() => {}} onBack={() => {}} />,
    );
    expect(c.textContent).toContain('0/8 used');
    const empties = c.querySelectorAll('button[aria-label^="Empty slot"]');
    expect(empties).toHaveLength(8);
    expect(c.textContent).not.toContain('Retrieve'); // nothing selected yet
  });

  it('shows stored artwork and the used capacity', async () => {
    const slots = empty();
    slots[2] = { id: 1, chain: 'flower', tier: 4 };
    const c = await mount(
      <StorageView slots={slots} capacity={8} boardFull={false} onRetrieve={() => {}} onBack={() => {}} />,
    );
    expect(c.textContent).toContain('1/8 used');
    const img = c.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/assets/items/flower-4-blossom.png');
    expect(img?.getAttribute('alt')).toBe('Blossom');
    expect(c.querySelector('button[aria-label="Blossom (slot 3)"]')).not.toBeNull();
  });

  it('selecting a stored item reveals Retrieve, which reports the slot index', async () => {
    const slots = empty();
    slots[2] = { id: 1, chain: 'flower', tier: 4 };
    const onRetrieve = vi.fn();
    const c = await mount(
      <StorageView slots={slots} capacity={8} boardFull={false} onRetrieve={onRetrieve} onBack={() => {}} />,
    );
    await act(async () => {
      const slot = c.querySelector('button[aria-label="Blossom (slot 3)"]') as HTMLButtonElement;
      expect(slot).not.toBeNull();
      slot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(c.textContent).toContain('Blossom');
    expect(c.textContent).toContain('Tier 4 of 5');
    await act(async () => {
      buttonByText(c, 'Retrieve').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRetrieve).toHaveBeenCalledTimes(1);
    expect(onRetrieve).toHaveBeenCalledWith(2);
    // selection resets after retrieving
    expect(c.textContent).not.toContain('Tier 4 of 5');
  });

  it('disables Retrieve while the board is full', async () => {
    const slots = empty();
    slots[0] = { id: 2, chain: 'frog', tier: 1 };
    const onRetrieve = vi.fn();
    const c = await mount(
      <StorageView slots={slots} capacity={8} boardFull onRetrieve={onRetrieve} onBack={() => {}} />,
    );
    await act(async () => {
      const slot = c.querySelector('button[aria-label="Tadpole (slot 1)"]') as HTMLButtonElement;
      expect(slot).not.toBeNull();
      slot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(c.textContent).toContain('Board is full');
    const retrieve = buttonByText(c, 'Retrieve');
    expect(retrieve.disabled).toBe(true);
    await act(async () => {
      retrieve.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRetrieve).not.toHaveBeenCalled(); // item stays safely in storage
  });

  it('calls onBack from the Back button', async () => {
    const onBack = vi.fn();
    const c = await mount(
      <StorageView slots={empty()} capacity={8} boardFull={false} onRetrieve={() => {}} onBack={onBack} />,
    );
    await act(async () => {
      buttonByText(c, 'Back').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
