// @vitest-environment jsdom
/**
 * Board interaction wiring for selection: a press released on its own cell
 * is a *tap* (select, no gameplay), movement to another cell stays a *drag*
 * (drop/merge), empty tiles clear via tap, generators keep their own tap,
 * and the selected cell gets a subtle outline.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// React requires this flag for act()-based updates outside of a test renderer.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import Board from './Board';
import { createEmptyBoard, createGenerator } from '../game/board';
import type { Board as BoardType } from '../game/types';

// jsdom has no layout engine or pointer capture. Stub the two browser pieces
// Board's pointer logic uses; tests control hit-testing via `hit` (the element
// "under the finger" — Board resolves it through document.elementFromPoint).
let hit: HTMLElement | null = null;

beforeAll(() => {
  Object.defineProperty(document, 'elementFromPoint', { value: () => hit, configurable: true });
  (HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture = () => {};
  (HTMLElement.prototype as unknown as Record<string, unknown>).releasePointerCapture = () => {};
});

function boardWithItems(): BoardType {
  const b = createEmptyBoard();
  b[0][0] = { id: 1, chain: 'frog', tier: 1 };
  b[3][3] = { id: 2, chain: 'flower', tier: 2 };
  return b;
}

describe('board selection interaction', () => {
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
    hit = null;
  });

  function cell(c: ParentNode, r: number, col: number): HTMLElement {
    const el = c.querySelector(`[data-row="${r}"][data-col="${col}"]`);
    expect(el, `cell ${r},${col}`).not.toBeNull();
    return el as HTMLElement;
  }

  function itemWrapper(c: ParentNode, r: number, col: number): HTMLElement {
    const w = cell(c, r, col).querySelector(':scope > div');
    expect(w, `item wrapper ${r},${col}`).not.toBeNull();
    return w as HTMLElement;
  }

  async function firePointer(el: Element, type: string, x = 0, y = 0) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    });
  }

  async function tap(el: Element, x = 1, y = 1) {
    await firePointer(el, 'pointerdown', x, y);
    await firePointer(el, 'pointerup', x, y);
  }

  it('tapping an item selects it and never triggers a drop', async () => {
    const onTap = vi.fn();
    const onDrop = vi.fn();
    await mount(
      <Board
        board={boardWithItems()}
        nudge={false}
        hint={null}
        selected={null}
        onDrop={onDrop}
        onGeneratorTap={vi.fn()}
        onTap={onTap}
      />,
    );
    const wrap = itemWrapper(container!, 0, 0);
    hit = cell(container!, 0, 0); // released over its own cell = tap
    await tap(wrap);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith({ row: 0, col: 0 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('dragging an item onto another cell drops and never selects', async () => {
    const onTap = vi.fn();
    const onDrop = vi.fn();
    await mount(
      <Board
        board={boardWithItems()}
        nudge={false}
        hint={null}
        selected={null}
        onDrop={onDrop}
        onGeneratorTap={vi.fn()}
        onTap={onTap}
      />,
    );
    const wrap = itemWrapper(container!, 0, 0);
    hit = cell(container!, 0, 0);
    await firePointer(wrap, 'pointerdown', 1, 1);
    hit = cell(container!, 3, 3); // finger moved over another cell
    await firePointer(wrap, 'pointermove', 20, 20);
    await firePointer(wrap, 'pointerup', 20, 20);
    expect(onDrop).toHaveBeenCalledWith({ row: 0, col: 0 }, { row: 3, col: 3 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it('releasing outside the grid does nothing', async () => {
    const onTap = vi.fn();
    const onDrop = vi.fn();
    await mount(
      <Board
        board={boardWithItems()}
        nudge={false}
        hint={null}
        selected={null}
        onDrop={onDrop}
        onGeneratorTap={vi.fn()}
        onTap={onTap}
      />,
    );
    const wrap = itemWrapper(container!, 0, 0);
    hit = null; // elementFromPoint finds nothing
    await tap(wrap);
    expect(onTap).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('tapping an empty tile reports that cell (clears selection upstream)', async () => {
    const onTap = vi.fn();
    await mount(
      <Board
        board={boardWithItems()}
        nudge={false}
        hint={null}
        selected={null}
        onDrop={vi.fn()}
        onGeneratorTap={vi.fn()}
        onTap={onTap}
      />,
    );
    await tap(cell(container!, 6, 6));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith({ row: 6, col: 6 });
  });

  it('generator taps still route to spawning, not selection', async () => {
    const onTap = vi.fn();
    const onGeneratorTap = vi.fn();
    const b = createEmptyBoard();
    b[2][2] = createGenerator('flower');
    await mount(
      <Board
        board={b}
        nudge={false}
        hint={null}
        selected={null}
        onDrop={vi.fn()}
        onGeneratorTap={onGeneratorTap}
        onTap={onTap}
      />,
    );
    const genButton = cell(container!, 2, 2).querySelector('button');
    expect(genButton).not.toBeNull();
    await act(async () => {
      genButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGeneratorTap).toHaveBeenCalledWith({ row: 2, col: 2 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it('outlines the selected cell with a subtle highlight', async () => {
    await mount(
      <Board
        board={boardWithItems()}
        nudge={false}
        hint={null}
        selected={{ row: 0, col: 0 }}
        onDrop={vi.fn()}
        onGeneratorTap={vi.fn()}
        onTap={vi.fn()}
      />,
    );
    expect(cell(container!, 0, 0).style.boxShadow).toBe('0 0 0 2px #ffb74d');
    expect(cell(container!, 3, 3).style.boxShadow).toBe('none');
  });
});
