import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import {
  canFulfill,
  countAvailable,
  generateOrder,
  generateOrderSet,
  migrateOrders,
  resetOrderIds,
  type OrderContext,
} from './orders';
import { createInitialState, gameReducer, toPersisted, type GameState } from './state';
import { createEmptyBoard, createItem, resetItemIds } from './board';
import { clearSave, loadGame, saveGame } from '../storage';
import type { ChainId, Order } from './types';

beforeEach(() => {
  resetOrderIds();
  resetItemIds();
  localStorageMock.clear();
  clearSave();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function item(chain: ChainId, tier: number): { chain: ChainId; tier: number; count: number } {
  return { chain, tier, count: 1 };
}

function serveCtx(existingOrders: Order[], completedOrders = 5): OrderContext {
  // Early-game conditions: only two chains unlocked, plot 1 tier range {1..3}.
  return {
    chains: ['frog', 'flower'],
    completedOrders,
    plotIndex: 0,
    existingOrders,
    board: createEmptyBoard(),
  };
}

const frog2: Order = { id: 1, requirements: [{ chain: 'frog', tier: 2, count: 2 }] };
const flower2: Order = { id: 2, requirements: [{ chain: 'flower', tier: 2, count: 2 }] };
const frog3: Order = { id: 3, requirements: [{ chain: 'frog', tier: 3, count: 1 }] };

function requirementKeys(orders: Order[]): string[] {
  return orders.flatMap((o) => o.requirements.map((r) => `${r.chain}:${r.tier}`));
}

/** Places the items needed to fulfill every active order onto the board. */
function fillBoard(s: GameState): GameState {
  const board = s.board.map((r) => r.slice());
  for (const o of s.orders) {
    for (const r of o.requirements) {
      let need = r.count;
      for (let row = 0; row < 7 && need > 0; row++) {
        for (let col = 0; col < 7 && need > 0; col++) {
          if (board[row][col] === null) {
            board[row][col] = createItem(r.chain, r.tier);
            need--;
          }
        }
      }
    }
  }
  return { ...s, board };
}

describe('replacement orders must not duplicate active orders', () => {
  it('never reproduces an already-requested chain:tier when another is available (deterministic worst case)', () => {
    // Worst case: every random pick takes the first candidate.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const existing = [frog2, flower2, frog3];
    const used = new Set(requirementKeys(existing));
    for (let i = 0; i < 50; i++) {
      const order = generateOrder(serveCtx(existing));
      for (const r of order.requirements) {
        expect(used.has(`${r.chain}:${r.tier}`)).toBe(false);
      }
    }
  });

  it('never reproduces an already-requested chain:tier with real randomness', () => {
    const existing = [frog2, flower2];
    const used = new Set(requirementKeys(existing));
    for (let i = 0; i < 200; i++) {
      const order = generateOrder(serveCtx(existing));
      for (const r of order.requirements) {
        expect(used.has(`${r.chain}:${r.tier}`)).toBe(false);
      }
    }
  });

  it('initial order set has unique ids and no duplicated requirement keys', () => {
    for (let i = 0; i < 100; i++) {
      const set = generateOrderSet(['flower', 'frog'], 0, 0);
      expect(set).toHaveLength(3);
      const ids = set.map((o) => o.id);
      expect(new Set(ids).size).toBe(3);
      const keys = requirementKeys(set);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('order ids must survive app restarts', () => {
  it('migrateOrders advances the id counter past saved order ids', () => {
    const saved: Order[] = [
      { id: 7, requirements: [item('frog', 1)] },
      { id: 8, requirements: [item('flower', 2)] },
    ];
    migrateOrders(saved);
    const next = generateOrder(serveCtx([]));
    expect(next.id).toBeGreaterThan(8);
  });

  it('migrateOrders reissues duplicate ids from already-corrupted saves without dropping orders', () => {
    const corrupted: Order[] = [
      { id: 5, requirements: [{ chain: 'frog', tier: 2, count: 2 }] },
      { id: 5, requirements: [{ chain: 'flower', tier: 2, count: 2 }] },
    ];
    const healed = migrateOrders(corrupted);
    expect(healed).toHaveLength(2);
    const ids = healed.map((o) => o.id);
    expect(new Set(ids).size).toBe(2);
    // requirements are preserved untouched
    expect(healed[0].requirements).toEqual(corrupted[0].requirements);
    expect(healed[1].requirements).toEqual(corrupted[1].requirements);
    // and the counter now issues ids beyond every healed id
    expect(generateOrder(serveCtx([])).id).toBeGreaterThan(Math.max(...ids));
  });

  it('migrateOrders leaves clean saves untouched (identity preserved)', () => {
    const clean: Order[] = [
      { id: 1, requirements: [item('frog', 1)] },
      { id: 2, requirements: [item('flower', 2)] },
    ];
    expect(migrateOrders(clean)).toBe(clean);
  });

  it('serving after a reload never reuses an active order id', () => {
    // Fresh session: ids 1..3 are active when the app was last closed.
    let state = fillBoard({
      ...createInitialState(),
      orders: [
        { id: 1, requirements: [{ chain: 'frog', tier: 1, count: 1 }] },
        { id: 2, requirements: [item('flower', 1)] },
        { id: 3, requirements: [item('frog', 2)] },
      ],
    });
    saveGame(toPersisted(state));

    // Simulate an Android app restart: module counters reset, then the save loads.
    resetOrderIds();
    const resumed = createInitialState(loadGame());
    expect(resumed.orders.map((o) => o.id)).toEqual([1, 2, 3]);

    // Serve a middle order; its replacement must not collide with ids 1 or 3.
    const next = gameReducer(resumed, { type: 'SERVE_ORDER', orderId: 2 });
    expect(next.orders).toHaveLength(3);
    const ids = next.orders.map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('keeps order ids and requirement keys unique across repeated restarts and serves', () => {
    let state = createInitialState();

    for (let i = 0; i < 20; i++) {
      // Simulate an app restart around every serve.
      resetOrderIds();
      saveGame(toPersisted(state));
      const loaded = loadGame();
      expect(loaded).not.toBeNull();
      state = fillBoard(createInitialState(loaded));

      const target = state.orders[i % state.orders.length];
      expect(canFulfill(state.board, target)).toBe(true);
      state = gameReducer(state, { type: 'SERVE_ORDER', orderId: target.id });

      const ids = state.orders.map((o) => o.id);
      expect(new Set(ids).size).toBe(state.orders.length);
      const keys = requirementKeys(state.orders);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('serving an order replaces exactly one order', () => {
  it('serving a legacy save where an id appears twice replaces only one order', () => {
    const s0 = createInitialState();
    const b = createEmptyBoard();
    b[0][0] = createItem('frog', 1);
    const orders: Order[] = [
      { id: 1, requirements: [{ chain: 'frog', tier: 1, count: 1 }] },
      { id: 1, requirements: [{ chain: 'flower', tier: 1, count: 1 }] },
      { id: 2, requirements: [item('frog', 3)] },
    ];
    const state = { ...s0, board: b, orders };
    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });

    // Exactly one order slot was replaced; the other id-1 order remains intact.
    expect(next.orders.filter((o) => o.id === 1)).toHaveLength(1);
    // The replacement must be a distinct object (no shared/duplicated order).
    expect(next.orders[0]).not.toBe(next.orders[1]);
    // Reward granted exactly once.
    expect(next.progress.stars).toBe(1);
    expect(next.progress.completedOrders).toBe(1);
  });
});

describe('consumption and readiness stay in sync', () => {
  it('serving one of two orders sharing an item type consumes the items and clears readiness on the other', () => {
    const s0 = createInitialState();
    const b = createEmptyBoard();
    b[0][0] = createItem('frog', 2);
    b[0][1] = createItem('frog', 2);
    const a: Order = { id: 10, requirements: [{ chain: 'frog', tier: 2, count: 2 }] };
    const c: Order = { id: 11, requirements: [{ chain: 'frog', tier: 2, count: 2 }] };
    const state = { ...s0, board: b, orders: [a, c] };

    // Both orders display 2/2 Ready against the shared board.
    expect(canFulfill(state.board, a)).toBe(true);
    expect(canFulfill(state.board, c)).toBe(true);

    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: a.id });
    expect(countAvailable(next.board, a.requirements[0])).toBe(0);
    // The other order must no longer be fulfillable once the items are gone.
    expect(canFulfill(next.board, c)).toBe(false);
  });
});
