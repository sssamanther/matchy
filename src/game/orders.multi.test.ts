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
  plotTierRange,
  resetOrderIds,
  type OrderContext,
} from './orders';
import { createInitialState, gameReducer, toPersisted, type PersistedGameState } from './state';
import { createEmptyBoard, createItem, resetItemIds } from './board';
import { clearSave, loadGame, saveGame } from '../storage';
import { CHAINS, type Board, type ChainId, type Order, type OrderRequirement } from './types';

beforeEach(() => {
  resetOrderIds();
  resetItemIds();
  localStorageMock.clear();
  clearSave();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function req(chain: ChainId, tier: number, count = 1): OrderRequirement {
  return { chain, tier, count };
}

/** Order-independent canonical key for a requirement set (chain+tier+count). */
function setKey(o: Order): string {
  return o.requirements.map((r) => `${r.chain}:${r.tier}:${r.count}`).sort().join('|');
}

/** chain:tier atoms used across a set of orders (counts ignored). */
function atomsOf(orders: Order[]): string[] {
  return orders.flatMap((o) => o.requirements.map((r) => `${r.chain}:${r.tier}`));
}

function ctx(overrides: Partial<OrderContext> = {}): OrderContext {
  return {
    chains: ['frog', 'flower'],
    completedOrders: 5,
    plotIndex: 0,
    existingOrders: [],
    board: createEmptyBoard(),
    ...overrides,
  };
}

/** A Level 3 save written by a pre-fix build: three identical Froglet Tier 3 orders. */
function frogletSave(): PersistedGameState {
  return {
    version: 1,
    plotIndex: 0,
    board: createEmptyBoard(),
    orders: [
      { id: 4, requirements: [req('frog', 3)] },
      { id: 5, requirements: [req('frog', 3)] },
      { id: 6, requirements: [req('frog', 3)] },
    ],
    progress: { currentPlot: 1, stars: 40, plotStars: 12, completedOrders: 14 },
    unlockedPlots: [1],
    xp: 130,
    level: 3,
    starBalance: 40,
    unlockedChains: ['flower', 'frog'],
  };
}

describe('legacy saves with three identical Froglet Tier 3 orders', () => {
  it('reconciles into three distinct orders on load', () => {
    saveGame(frogletSave());
    const loaded = createInitialState(loadGame());

    expect(loaded.orders).toHaveLength(3);
    expect(new Set(loaded.orders.map(setKey)).size).toBe(3);
    expect(new Set(loaded.orders.map((o) => o.id)).size).toBe(3);
    // The first Froglet order is kept untouched; only the duplicates are replaced.
    expect(loaded.orders[0].requirements).toEqual([req('frog', 3)]);
    expect(loaded.orders.filter((o) => setKey(o) === 'frog:3:1')).toHaveLength(1);
  });

  it('reconciles without touching progress, level, xp, stars or the board', () => {
    const save = frogletSave();
    save.board[0][0] = createItem('frog', 2);
    saveGame(save);

    const loaded = createInitialState(loadGame());

    expect(loaded.progress).toEqual(save.progress);
    expect(loaded.xp).toBe(130);
    expect(loaded.level).toBe(3);
    expect(loaded.starBalance).toBe(40);
    expect(loaded.orders).toHaveLength(3);
    expect(loaded.board[0][0]).toEqual(expect.objectContaining({ chain: 'frog', tier: 2 }));

    // Replacement orders never come from locked chains or inaccessible tiers.
    const unlocked = new Set<ChainId>(loaded.unlockedChains);
    for (const r of loaded.orders.flatMap((o) => o.requirements)) {
      expect(unlocked.has(r.chain)).toBe(true);
      expect(r.tier).toBeGreaterThanOrEqual(1);
      expect(r.tier).toBeLessThanOrEqual(5);
      expect(r.count).toBeGreaterThanOrEqual(1);
    }

    // A second save/load cycle is stable (no churn, no re-duplication).
    saveGame(toPersisted(loaded));
    const again = createInitialState(loadGame());
    expect(again.orders.map(setKey)).toEqual(loaded.orders.map(setKey));
    expect(again.orders.map((o) => o.id)).toEqual(loaded.orders.map((o) => o.id));
  });

  it('allows serving a reconciled order and keeps ids and keys unique afterwards', () => {
    const save = frogletSave();
    save.board[0][0] = createItem('frog', 3);
    saveGame(save);

    let state = createInitialState(loadGame());
    state = gameReducer(state, { type: 'SERVE_ORDER', orderId: state.orders[0].id });

    expect(state.progress.completedOrders).toBe(15);
    expect(state.progress.stars).toBe(44); // 40 saved + 4 for frog tier 3
    expect(state.orders).toHaveLength(3);
    expect(new Set(state.orders.map((o) => o.id)).size).toBe(3);
    expect(new Set(state.orders.map(setKey)).size).toBe(3);
  });
});

describe('duplicate prevention during generation', () => {
  it('replacement orders never reuse an active chain:tier (deterministic worst case)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const existing: Order[] = [
      { id: 1, requirements: [req('frog', 2, 2)] },
      { id: 2, requirements: [req('flower', 2, 2)] },
      { id: 3, requirements: [req('frog', 3)] },
    ];
    const used = new Set(atomsOf(existing));
    for (let i = 0; i < 50; i++) {
      const order = generateOrder(ctx({ existingOrders: existing, level: 3 }));
      expect(order.requirements.length).toBeGreaterThan(0);
      for (const r of order.requirements) {
        expect(used.has(`${r.chain}:${r.tier}`)).toBe(false);
      }
    }
  });

  it('replacement orders never reuse an active chain:tier with real randomness', () => {
    const existing: Order[] = [
      { id: 1, requirements: [req('frog', 2, 2)] },
      { id: 2, requirements: [req('flower', 2, 2)] },
    ];
    const used = new Set(atomsOf(existing));
    for (let i = 0; i < 200; i++) {
      const order = generateOrder(ctx({ existingOrders: existing, level: 4 }));
      for (const r of order.requirements) {
        expect(used.has(`${r.chain}:${r.tier}`)).toBe(false);
      }
    }
  });

  it('initial sets across all levels and plots have unique atoms, keys and ids', () => {
    const chainSets: ChainId[][] = [
      ['flower', 'frog'],
      ['flower', 'frog', 'plant', 'mushroom'],
      [...CHAINS],
    ];
    for (const chains of chainSets) {
      for (let plotIndex = 0; plotIndex < 5; plotIndex++) {
        for (let i = 0; i < 20; i++) {
          const set = generateOrderSet(chains, plotIndex, i * 4, chains.length + 2);
          expect(set).toHaveLength(3);
          expect(new Set(set.map((o) => o.id)).size).toBe(3);
          expect(new Set(set.map(setKey)).size).toBe(3);
          const atoms = atomsOf(set);
          expect(new Set(atoms).size).toBe(atoms.length);
          const range = plotTierRange(plotIndex);
          for (const r of set.flatMap((o) => o.requirements)) {
            expect(chains).toContain(r.chain);
            expect(r.tier).toBeGreaterThanOrEqual(range.min);
            expect(r.tier).toBeLessThanOrEqual(Math.min(range.max, 5));
            expect(r.count).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('replacement orders never require chains outside the unlocked set', () => {
    for (let i = 0; i < 100; i++) {
      const order = generateOrder(ctx({ chains: ['frog', 'flower'], level: 7, completedOrders: 30 }));
      for (const r of order.requirements) {
        expect(['frog', 'flower']).toContain(r.chain);
        expect(r.tier).toBeGreaterThanOrEqual(1);
        expect(r.tier).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('multi-item order generation scales with level', () => {
  it('level 1 initial sets are mostly single-item with occasional easy two-item orders', () => {
    let singles = 0;
    let doubles = 0;
    let total = 0;
    for (let i = 0; i < 150; i++) {
      const set = generateOrderSet(['flower', 'frog'], 0, 0, 1);
      for (const o of set) {
        total++;
        if (o.requirements.length === 1) singles++;
        else {
          doubles++;
          // "Easy": a level-1 two-item order never demands more than 4 items.
          const items = o.requirements.reduce((n, r) => n + r.count, 0);
          expect(items).toBeLessThanOrEqual(4);
        }
      }
    }
    expect(total).toBe(450);
    expect(doubles).toBeGreaterThan(0);
    expect(singles / total).toBeGreaterThan(0.6);
  });

  it('replacement orders at level 2-3 frequently include two-item orders', () => {
    const existing: Order[] = [
      { id: 1, requirements: [req('frog', 3)] },
      { id: 2, requirements: [req('flower', 2, 2)] },
      { id: 3, requirements: [req('frog', 1, 2)] },
    ];
    let doubles = 0;
    for (let i = 0; i < 100; i++) {
      const order = generateOrder(ctx({ existingOrders: existing, completedOrders: 10, level: 3 }));
      if (order.requirements.length >= 2) doubles++;
      expect(order.requirements.length).toBeLessThanOrEqual(3);
    }
    expect(doubles).toBeGreaterThan(0);
  });

  it('level 7+ initial sets include three-item orders', () => {
    let triples = 0;
    for (let i = 0; i < 100; i++) {
      const set = generateOrderSet([...CHAINS], 2, 30, 7);
      for (const o of set) if (o.requirements.length === 3) triples++;
      // every requirement stays within the plot's producible tier range
      for (const r of set.flatMap((o) => o.requirements)) {
        expect(r.tier).toBeGreaterThanOrEqual(3);
        expect(r.tier).toBeLessThanOrEqual(5);
      }
    }
    expect(triples).toBeGreaterThan(0);
  });

  it('level 4-6 initial sets occasionally include three-item orders', () => {
    let triples = 0;
    for (let i = 0; i < 100; i++) {
      const set = generateOrderSet(['flower', 'frog', 'plant', 'mushroom'], 0, 12, 5);
      for (const o of set) if (o.requirements.length === 3) triples++;
    }
    expect(triples).toBeGreaterThan(0);
  });
});

describe('multi-item readiness', () => {
  it('stays unready while any single requirement is missing', () => {
    const b = createEmptyBoard();
    b[0][0] = createItem('frog', 2);
    b[0][1] = createItem('frog', 2);
    const order: Order = { id: 1, requirements: [req('frog', 2, 2), req('flower', 1, 1)] };

    expect(canFulfill(b, order)).toBe(false); // flower missing

    const withFlower = b.map((r) => r.slice());
    withFlower[0][2] = createItem('flower', 1);
    expect(canFulfill(withFlower, order)).toBe(true);

    withFlower[0][0] = null; // one frog short
    expect(canFulfill(withFlower, order)).toBe(false);
  });

  it('aggregates requirements that share the same chain and tier', () => {
    const two = createEmptyBoard();
    two[0][0] = createItem('frog', 3);
    two[0][1] = createItem('frog', 3);
    const order: Order = { id: 1, requirements: [req('frog', 3, 1), req('frog', 3, 2)] };

    // 2 available but 3 required in total -> not ready.
    expect(canFulfill(two, order)).toBe(false);

    const three = two.map((r) => r.slice());
    three[0][2] = createItem('frog', 3);
    expect(canFulfill(three, order)).toBe(true);
  });

  it('shares available inventory correctly across requirements', () => {
    const b = createEmptyBoard();
    b[0][0] = createItem('frog', 1);
    b[0][1] = createItem('frog', 1);
    b[0][2] = createItem('flower', 1);
    const order: Order = { id: 1, requirements: [req('frog', 1, 2), req('flower', 1, 1)] };

    expect(canFulfill(b, order)).toBe(true);
    b[0][1] = null;
    expect(canFulfill(b, order)).toBe(false);
  });
});

describe('atomic multi-item completion', () => {
  const multi: Order = { id: 10, requirements: [req('frog', 2, 2), req('flower', 1, 1)] };
  const other: Order = { id: 11, requirements: [req('frog', 1, 1)] };

  function boardWith(both: boolean): Board {
    const b = createEmptyBoard();
    b[0][0] = createItem('frog', 2);
    b[0][1] = createItem('frog', 2);
    if (both) b[0][2] = createItem('flower', 1);
    b[0][3] = createItem('frog', 1);
    return b;
  }

  it('consumes every requirement exactly once and awards rewards exactly once', () => {
    const state = { ...createInitialState(), board: boardWith(true), orders: [multi, other] };
    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 10 });

    expect(countAvailable(next.board, req('frog', 2))).toBe(0);
    expect(countAvailable(next.board, req('flower', 1))).toBe(0);
    // The other order's item is untouched.
    expect(countAvailable(next.board, req('frog', 1))).toBe(1);

    // reward = 2x tier2 (2 each) + 1x tier1 (1) = 5
    expect(next.progress.stars).toBe(5);
    expect(next.starBalance).toBe(5);
    expect(next.xp).toBe(5);
    expect(next.progress.completedOrders).toBe(1);

    // Exactly one order slot was replaced; the other order object is untouched.
    expect(next.orders).toHaveLength(2);
    expect(next.orders[1]).toBe(other);
    expect(next.orders.map((o) => o.id)).not.toContain(10);
    expect(new Set(next.orders.map((o) => o.id)).size).toBe(2);
    // Readiness of remaining orders is recalculated against the new board.
    expect(canFulfill(next.board, other)).toBe(true);
  });

  it('does not consume or reward anything when one requirement cannot be fulfilled', () => {
    const state = { ...createInitialState(), board: boardWith(false), orders: [multi, other] };
    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 10 });

    expect(next).toBe(state); // pure no-op
    expect(countAvailable(next.board, req('frog', 2))).toBe(2);
    expect(next.progress.stars).toBe(0);
    expect(next.progress.completedOrders).toBe(0);
    expect(next.orders).toHaveLength(2);
  });

  it('double completion of a multi-item order awards nothing the second time', () => {
    const state = { ...createInitialState(), board: boardWith(true), orders: [multi, other] };
    const first = gameReducer(state, { type: 'SERVE_ORDER', orderId: 10 });
    expect(first.progress.stars).toBe(5);

    const second = gameReducer(first, { type: 'SERVE_ORDER', orderId: 10 });
    expect(second).toBe(first);
    expect(second.progress.stars).toBe(5);
    expect(second.progress.completedOrders).toBe(1);
  });

  it('readiness of orders sharing inventory recalculates after a multi-item serve', () => {
    // Both orders need the same two frog tier-2 items; only one can be served.
    const a: Order = { id: 20, requirements: [req('frog', 2, 2), req('flower', 1, 1)] };
    const c: Order = { id: 21, requirements: [req('frog', 2, 2)] };
    const state = { ...createInitialState(), board: boardWith(true), orders: [a, c] };

    expect(canFulfill(state.board, a)).toBe(true);
    expect(canFulfill(state.board, c)).toBe(true);

    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 20 });
    expect(countAvailable(next.board, req('frog', 2))).toBe(0);
    expect(canFulfill(next.board, c)).toBe(false);
    expect(next.orders.find((o) => o.id === 21)).toEqual(c);
  });
});

describe('save/load compatibility', () => {
  it('legacy single-item orders (flat chain/tier/count format) load and stay servable', () => {
    const board = createEmptyBoard();
    board[0][0] = createItem('frog', 1);
    saveGame({
      version: 1,
      plotIndex: 0,
      board,
      orders: [{ id: 7, chain: 'frog', tier: 1, count: 1 }] as unknown as Order[],
      progress: { currentPlot: 1, stars: 0, plotStars: 0, completedOrders: 0 },
      unlockedPlots: [1],
    });

    const loaded = createInitialState(loadGame());
    expect(loaded.orders).toEqual([{ id: 7, requirements: [req('frog', 1, 1)] }]);

    const next = gameReducer(loaded, { type: 'SERVE_ORDER', orderId: 7 });
    expect(next.progress.completedOrders).toBe(1);
    expect(next.progress.stars).toBe(1);
  });

  it('multi-item orders persist through save/load', () => {
    const state = {
      ...createInitialState(),
      orders: [
        { id: 20, requirements: [req('frog', 2, 2), req('flower', 1, 1)] },
        { id: 21, requirements: [req('mushroom', 3), req('frog', 1, 1), req('flower', 2)] },
        { id: 22, requirements: [req('frog', 3)] },
      ],
    };
    saveGame(toPersisted(state));

    const loaded = createInitialState(loadGame());
    expect(loaded.orders.map(setKey)).toEqual(state.orders.map(setKey));
    expect(loaded.orders.map((o) => o.id)).toEqual([20, 21, 22]);
    expect(loaded.orders).toHaveLength(3);
  });

  it('heals saves with both duplicate ids and duplicate requirements, then serves safely', () => {
    const save = frogletSave();
    save.board[0][0] = createItem('frog', 3);
    save.orders = [
      { id: 5, requirements: [req('frog', 3)] },
      { id: 5, requirements: [req('frog', 3)] },
      { id: 5, requirements: [req('flower', 2, 2)] },
    ];
    saveGame(save);

    let state = createInitialState(loadGame());
    expect(new Set(state.orders.map((o) => o.id)).size).toBe(3);
    expect(new Set(state.orders.map(setKey)).size).toBe(3);

    state = gameReducer(state, { type: 'SERVE_ORDER', orderId: state.orders[0].id });
    expect(state.orders).toHaveLength(3);
    expect(new Set(state.orders.map((o) => o.id)).size).toBe(3);
    expect(new Set(state.orders.map(setKey)).size).toBe(3);
  });
});
