import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory localStorage (same pattern as state.test.ts).
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import {
  getOrderTier,
  generateOrder,
  generateOrderSet,
  levelTierRange,
  LEVEL_TIER_RANGE,
  resetOrderIds,
  type OrderContext,
} from './orders';
import { createInitialState, gameReducer, toPersisted, type GameState } from './state';
import { createEmptyBoard, createGenerator, createItem, resetItemIds } from './board';
import { PLOTS } from './plots';
import { clearSave, loadGame, saveGame } from '../storage';
import { ENERGY_CONFIG } from './energyConfig';
import {
  CHAIN_TIER_COUNT,
  CHAINS,
  isGenerator,
  type Board,
  type ChainId,
  type Generator,
  type Order,
} from './types';

/**
 * Phase 1 — level-based order progression on one persistent merge board.
 *
 * Covers: the provisional L1–L10 tier-range table, chain tier caps,
 * producible-chains-only orders, unreachable-order healing on load, legacy
 * saves with a nonzero plotIndex, board/generator preservation across
 * level-ups, level-up order transitions, pending generators, save/load
 * stability, early-order energy feasibility, and scene switches that never
 * reset the board.
 */

const T0 = 1_000_000;

beforeEach(() => {
  resetOrderIds();
  resetItemIds();
  localStorageMock.clear();
  clearSave();
  vi.restoreAllMocks();
});

function countGenerators(board: Board, chain: ChainId): number {
  return board.flat().filter((c): c is Generator => isGenerator(c)).filter((g) => g.chain === chain).length;
}

function occupiedCells(board: Board): number {
  return board.flat().filter((c) => c !== null).length;
}

function req(chain: ChainId, tier: number, count = 1) {
  return { chain, tier, count };
}

function orderKeyOf(o: Order): string {
  return o.requirements.map((r) => `${r.chain}:${r.tier}:${r.count}`).sort().join('|');
}

/**
 * Spawns a tier-N item costs 2^(N-1) generator taps (two tier-1 spawns merge
 * into one tier-2, and so on) — the energy a player must spend to finish an
 * order by producing every requirement from scratch.
 */
function spawnCost(order: Order): number {
  return order.requirements.reduce((n, r) => n + r.count * 2 ** (r.tier - 1), 0);
}

/** Fresh board with generators for exactly the given chains (row-major). */
function boardWithGenerators(chains: ChainId[]): Board {
  const b = createEmptyBoard();
  chains.forEach((chain, i) => {
    b[Math.floor(i / 7)][i % 7] = createGenerator(chain);
  });
  return b;
}

// ---------------------------------------------------------------------------
// 1. Tier ranges at levels 1–10 (provisional playtest table)
// ---------------------------------------------------------------------------

describe('level-based tier ranges', () => {
  const EXPECTED: Array<[level: number, min: number, max: number]> = [
    [1, 1, 2],
    [2, 1, 3],
    [3, 2, 4],
    [4, 2, 4],
    [5, 3, 4],
    [6, 3, 5],
    [7, 3, 5],
    [8, 4, 5],
    [9, 4, 5],
    [10, 4, 5],
  ];

  it('matches the provisional table exactly for levels 1–10', () => {
    for (const [level, min, max] of EXPECTED) {
      expect(levelTierRange(level)).toEqual({ min, max });
      expect(LEVEL_TIER_RANGE[level]).toEqual({ min, max });
    }
  });

  it('clamps out-of-range and malformed levels instead of failing', () => {
    expect(levelTierRange(0)).toEqual({ min: 1, max: 2 });
    expect(levelTierRange(-7)).toEqual({ min: 1, max: 2 });
    expect(levelTierRange(Number.NaN)).toEqual({ min: 1, max: 2 });
    expect(levelTierRange(11)).toEqual({ min: 4, max: 5 }); // beyond table: keep level 10
    expect(levelTierRange(99)).toEqual({ min: 4, max: 5 });
    expect(levelTierRange(3.9)).toEqual({ min: 2, max: 4 }); // fractional levels floor
  });

  it('never exceeds the highest tier any chain supports', () => {
    for (let level = 1; level <= 50; level++) {
      expect(levelTierRange(level).max).toBeLessThanOrEqual(CHAIN_TIER_COUNT);
      expect(levelTierRange(level).min).toBeGreaterThanOrEqual(1);
    }
  });

  it('getOrderTier always lands inside the level range and the chain cap', () => {
    for (let level = 1; level <= 10; level++) {
      const range = levelTierRange(level);
      for (let completed = 0; completed <= 40; completed++) {
        const tier = getOrderTier(completed, level);
        expect(tier).toBeGreaterThanOrEqual(range.min);
        expect(tier).toBeLessThanOrEqual(range.max);
        expect(tier).toBeLessThanOrEqual(CHAIN_TIER_COUNT);
      }
    }
  });

  it('starts players on the cheapest tier', () => {
    expect(getOrderTier(0, 1)).toBe(1);
    expect(getOrderTier(2, 1)).toBe(1);
  });

  it('bands get strictly harder as levels rise (level 1 vs level 10)', () => {
    const early = new Set<number>();
    const late = new Set<number>();
    for (let i = 0; i < 100; i++) {
      for (const r of generateOrderSet(CHAINS.slice(), i, 1).flatMap((o) => o.requirements)) early.add(r.tier);
      for (const r of generateOrderSet(CHAINS.slice(), i, 10).flatMap((o) => o.requirements)) late.add(r.tier);
    }
    expect(Math.max(...early)).toBeLessThanOrEqual(2); // L1 never past tier 2
    expect(Math.min(...late)).toBeGreaterThanOrEqual(4); // L10 never below tier 4
  });
});

// ---------------------------------------------------------------------------
// 2. Orders never exceed chain tier limits
// ---------------------------------------------------------------------------

describe('chain tier limits', () => {
  it('generated sets at every level stay within the level range and chain cap', () => {
    for (let level = 1; level <= 10; level++) {
      const range = levelTierRange(level);
      for (let i = 0; i < 30; i++) {
        const set = generateOrderSet([...CHAINS], i * 3, level);
        for (const r of set.flatMap((o) => o.requirements)) {
          expect(r.tier).toBeGreaterThanOrEqual(range.min);
          expect(r.tier).toBeLessThanOrEqual(Math.min(range.max, CHAIN_TIER_COUNT));
          expect(r.count).toBeGreaterThanOrEqual(1);
          expect(CHAINS).toContain(r.chain);
        }
      }
    }
  });

  it('single order generation respects the cap under any randomness', () => {
    for (const roll of [0, 0.5, 0.999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(roll);
      for (let level = 1; level <= 10; level++) {
        const range = levelTierRange(level);
        const ctx: OrderContext = {
          chains: [...CHAINS],
          completedOrders: 17,
          existingOrders: [],
          level,
        };
        for (let i = 0; i < 10; i++) {
          const order = generateOrder(ctx);
          expect(order.requirements.length).toBeGreaterThan(0);
          for (const r of order.requirements) {
            expect(r.tier).toBeGreaterThanOrEqual(range.min);
            expect(r.tier).toBeLessThanOrEqual(range.max);
            expect(r.tier).toBeLessThanOrEqual(CHAIN_TIER_COUNT);
          }
        }
      }
    }
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// 3. Orders only use chains the player can actually produce
// ---------------------------------------------------------------------------

describe('producible chains only', () => {
  it('a single-generator board yields orders for that chain only', () => {
    const board = boardWithGenerators(['frog']);
    for (let i = 0; i < 200; i++) {
      const order = generateOrder({
        chains: ['frog', 'flower'], // even with more chains unlocked…
        completedOrders: i,
        existingOrders: [],
        board, // …only the on-board generator is requested
        level: 4,
      });
      for (const r of order.requirements) expect(r.chain).toBe('frog');
    }
  });

  it('board generators win over a broader unlocked-chain fallback', () => {
    const board = boardWithGenerators(['frog', 'flower']);
    for (let i = 0; i < 100; i++) {
      const set = generateOrderSet([...CHAINS], i, 6, board);
      for (const r of set.flatMap((o) => o.requirements)) {
        expect(['frog', 'flower']).toContain(r.chain);
      }
    }
  });

  it('a fresh game only ever asks for the starting pair', () => {
    for (let i = 0; i < 50; i++) {
      const state = createInitialState(null, T0);
      for (const r of state.orders.flatMap((o) => o.requirements)) {
        expect(['flower', 'frog']).toContain(r.chain);
      }
      break; // deterministic initial set; loop guards against future randomness
    }
  });

  it('the replacement order after a serve only requests producible chains', () => {
    // Board with a lone frog generator (flower is unlocked but has no
    // generator here — orders must not ask for it).
    const b = createEmptyBoard();
    b[0][0] = createGenerator('frog');
    b[0][1] = createItem('frog', 1);
    const state: GameState = {
      ...createInitialState(null, T0),
      board: b,
      unlockedChains: ['flower', 'frog'],
      orders: [{ id: 1, requirements: [req('frog', 1, 1)] }],
    };

    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });
    expect(next.progress.completedOrders).toBe(1);
    for (const r of next.orders.flatMap((o) => o.requirements)) {
      expect(r.chain).toBe('frog');
    }
  });

  it('loads of unreachable orders are healed to producible chains, keeping ids and progress', () => {
    // Legacy save: plant is unlocked, but its generator was lost to the old
    // plot-switching system — a plant order would be unwinnable forever.
    const board = createEmptyBoard();
    board[0][0] = createGenerator('flower');
    board[6][6] = createGenerator('frog');
    board[3][3] = createItem('frog', 2);
    const orders: Order[] = [
      { id: 1, requirements: [req('plant', 3)] }, // unreachable → healed
      { id: 2, requirements: [req('frog', 2, 2)] }, // fine → untouched
      { id: 3, requirements: [req('flower', 1, 2)] }, // fine → untouched
    ];
    saveGame({
      version: 1,
      plotIndex: 0,
      board,
      orders,
      progress: { currentPlot: 1, stars: 7, plotStars: 2, completedOrders: 9 },
      unlockedPlots: [1],
      xp: 130,
      level: 3,
      starBalance: 7,
      unlockedChains: ['flower', 'frog', 'plant', 'mushroom'],
    });

    const loaded = createInitialState(loadGame());

    // Reconciliation restores the missing plant generator, making the order reachable.
    expect(loaded.orders[0].id).toBe(1);
    for (const r of loaded.orders[0].requirements) {
      expect(['flower', 'frog', 'plant']).toContain(r.chain);
    }
    // …healthy orders untouched, progress and board preserved.
    expect(loaded.orders[1]).toEqual(orders[1]);
    expect(loaded.orders[2]).toEqual(orders[2]);
    // Board now includes the restored plant generator.
    expect(loaded.board).not.toEqual(board);
    const plantGen = loaded.board.flat().find((c): c is Generator => isGenerator(c) && c.chain === 'plant');
    expect(plantGen).toBeDefined();
    expect(loaded.progress).toEqual({ currentPlot: 1, stars: 7, plotStars: 2, completedOrders: 9 });
    expect(loaded.xp).toBe(130);
    expect(loaded.level).toBe(3);
    expect(loaded.starBalance).toBe(7);

    // A second cycle is stable — reconciliation happens at most once, no churn.
    saveGame(toPersisted(loaded));
    const again = createInitialState(loadGame());
    expect(again.orders.map(orderKeyOf)).toEqual(loaded.orders.map(orderKeyOf));
    expect(again.orders.map((o) => o.id)).toEqual(loaded.orders.map((o) => o.id));
  });
});

// ---------------------------------------------------------------------------
// 4. Legacy saves with a nonzero plotIndex
// ---------------------------------------------------------------------------

describe('legacy plot data is compatibility-only', () => {
  it('loads a nonzero plotIndex save intact, but orders follow the level', () => {
    const board = createEmptyBoard();
    board[0][0] = createGenerator('flower');
    board[6][6] = createGenerator('frog');
    board[3][3] = createItem('frog', 5);
    saveGame({
      version: 1,
      plotIndex: 4, // old plot 5 used tier range {4..6}
      board,
      orders: [{ id: 1, requirements: [req('frog', 5)] }],
      progress: { currentPlot: 5, stars: 60, plotStars: 3, completedOrders: 30 },
      unlockedPlots: [1, 2, 3, 4, 5],
      xp: 0,
      level: 1, // …but the player is only level 1
      starBalance: 60,
      unlockedChains: ['flower', 'frog'],
    });

    const loaded = createInitialState(loadGame());

    // Plot fields survive as compatibility data.
    expect(loaded.plotIndex).toBe(4);
    expect(loaded.progress.currentPlot).toBe(5);
    expect(loaded.unlockedPlots).toEqual([1, 2, 3, 4, 5]);
    // The producible legacy order is kept verbatim.
    expect(loaded.orders).toEqual([{ id: 1, requirements: [req('frog', 5)] }]);

    // The replacement order after serving follows the LEVEL range (1–2),
    // never the old plot-based band (4–6).
    const next = gameReducer(loaded, { type: 'SERVE_ORDER', orderId: 1 });
    expect(next.progress.completedOrders).toBe(31);
    expect(next.progress.stars).toBe(69); // 60 + 9 for the tier-5 order
    for (const r of next.orders.flatMap((o) => o.requirements)) {
      expect(r.tier).toBeGreaterThanOrEqual(1);
      expect(r.tier).toBeLessThanOrEqual(2);
    }
  });

  it('scene switches never reset the board, orders or progress', () => {
    const s: GameState = {
      ...createInitialState(null, T0),
      unlockedPlots: [1, 2],
      energy: 63,
      starBalance: 40,
      xp: 130,
      level: 3,
      progress: { currentPlot: 1, stars: 40, plotStars: 5, completedOrders: 12 },
    };
    const slots = s.storageSlots.slice();
    slots[0] = createItem('mushroom', 2);
    const withStorage: GameState = { ...s, storageSlots: slots };

    const switched = gameReducer(withStorage, { type: 'SELECT_PLOT', index: 1 });
    expect(switched.plotIndex).toBe(1);
    expect(switched.progress.currentPlot).toBe(PLOTS[1].id); // scene metadata only
    expect(switched.board).toBe(withStorage.board); // same reference: not rebuilt
    expect(switched.orders).toBe(withStorage.orders); // not regenerated
    expect(switched.storageSlots).toBe(withStorage.storageSlots);
    expect(switched.energy).toBe(63);
    expect(switched.xp).toBe(130);
    expect(switched.starBalance).toBe(40);
    expect(switched.progress.stars).toBe(40);
    expect(switched.progress.completedOrders).toBe(12);

    const advanced = gameReducer(withStorage, { type: 'NEXT_PLOT' });
    expect(advanced.plotIndex).toBe(1);
    expect(advanced.unlockedPlots).toEqual([1, 2]);
    expect(advanced.board).toBe(withStorage.board);
    expect(advanced.orders).toBe(withStorage.orders);
    expect(advanced.storageSlots).toBe(withStorage.storageSlots);
    expect(advanced.energy).toBe(63);
    expect(advanced.progress.stars).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// 5. Board and generator preservation across level-ups
// ---------------------------------------------------------------------------

describe('level-up transitions keep the persistent board intact', () => {
  /** Level 2 state one XP short of level 3, with a fulfillable order. */
  function nearLevelUp(): GameState {
    const b = createEmptyBoard();
    b[0][0] = createGenerator('flower');
    b[6][6] = createGenerator('frog');
    b[1][1] = createItem('frog', 1); // served away during the level-up
    b[2][3] = createItem('frog', 2); // must survive untouched
    b[5][1] = createItem('flower', 1); // must survive untouched
    const slots = new Array(8).fill(null);
    slots[0] = createItem('mushroom', 2);
    return {
      ...createInitialState(null, T0),
      board: b,
      storageSlots: slots,
      xp: 124, // +1 XP reward => 125 => level 3
      level: 2,
      energy: 87,
      starBalance: 40,
      progress: { currentPlot: 1, stars: 40, plotStars: 6, completedOrders: 5 },
      orders: [
        { id: 1, requirements: [req('frog', 1, 1)] },
        { id: 2, requirements: [req('flower', 2, 1)] },
        { id: 3, requirements: [req('frog', 2, 2)] },
      ],
    };
  }

  it('level2 -> 3 preserves every cell, generator, item and inventory', () => {
    const state = nearLevelUp();
    const flowerGen = state.board[0][0];
    const frogGen = state.board[6][6];
    const servedItem = state.board[1][1];
    const survivorA = state.board[2][3];
    const survivorB = state.board[5][1];
    expect(servedItem).not.toBeNull();

    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });

    expect(next.level).toBe(3);
    // Only the consumed item left the board; generators keep their identity.
    expect(next.board[1][1]).toBeNull();
    expect(next.board[0][0]).toBe(flowerGen);
    expect(next.board[6][6]).toBe(frogGen);
    expect(next.board[2][3]).toBe(survivorA);
    expect(next.board[5][1]).toBe(survivorB);
    // Granted generators joined the board without overwriting anything.
    expect(countGenerators(next.board, 'plant')).toBe(1);
    expect(countGenerators(next.board, 'mushroom')).toBe(1);
    expect(occupiedCells(next.board)).toBe(6); // 5 before − 1 consumed + 2 granted
    expect(next.pendingGenerators).toEqual([]);

    // Inventory, energy and progress untouched by serving.
    expect(next.storageSlots).toBe(state.storageSlots);
    expect(next.energy).toBe(87);
    expect(next.starBalance).toBe(41);
    expect(next.xp).toBe(125);
    expect(next.progress.completedOrders).toBe(6);
    expect(next.progress.plotStars).toBe(7);

    // The other active orders keep their identity (only one slot is replaced).
    expect(next.orders[1]).toBe(state.orders[1]);
    expect(next.orders[2]).toBe(state.orders[2]);
  });

  it('the replacement order uses the new level band, not the old one', () => {
    const state = nearLevelUp();
    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });
    expect(next.level).toBe(3);
    // Level 3 range is {2..4}: a tier-1 requirement would prove stale bands.
    const replacement = next.orders[0];
    expect(replacement.requirements).not.toEqual(state.orders[0].requirements);
    for (const r of replacement.requirements) {
      expect(r.tier).toBeGreaterThanOrEqual(2);
      expect(r.tier).toBeLessThanOrEqual(4);
    }
    // Still producible: frog + flower generators remain on the board.
    for (const r of replacement.requirements) {
      expect(['frog', 'flower']).toContain(r.chain);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Pending generators while the board is full
// ---------------------------------------------------------------------------

describe('pending generators', () => {
  /** 49/49 cells: two generators plus frog tier-1 filler items. */
  function fullBoard(): Board {
    const b = createEmptyBoard();
    b[0][0] = createGenerator('flower');
    b[6][6] = createGenerator('frog');
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (b[r][c] === null) b[r][c] = createItem('frog', 1);
      }
    }
    return b;
  }

  it('queues the second unlock on a full board and never requests it in orders', () => {
    const state: GameState = {
      ...createInitialState(null, T0),
      board: fullBoard(),
      xp: 124,
      level: 2,
      orders: [{ id: 1, requirements: [req('frog', 1, 1)] }],
    };
    expect(occupiedCells(state.board)).toBe(49);

    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });

    expect(next.level).toBe(3);
    // One cell was freed by serving, so exactly one unlock fits; the second
    // queues instead of overwriting a cell.
    expect(countGenerators(next.board, 'plant')).toBe(1);
    expect(countGenerators(next.board, 'mushroom')).toBe(0);
    expect(next.pendingGenerators).toEqual(['mushroom']);
    expect(occupiedCells(next.board)).toBe(49);
    expect(countGenerators(next.board, 'flower')).toBe(1);
    expect(countGenerators(next.board, 'frog')).toBe(1);

    // The replacement order was generated against the board actually present
    // (flower + frog generators) — never for the queued chain.
    for (const r of next.orders.flatMap((o) => o.requirements)) {
      expect(['flower', 'frog']).toContain(r.chain);
    }
  });

  it('delivers the queued generator when a merge frees a cell', () => {
    const state: GameState = {
      ...createInitialState(null, T0),
      board: fullBoard(),
      xp: 124,
      level: 2,
      orders: [{ id: 1, requirements: [req('frog', 1, 1)] }],
    };
    const mid = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });
    expect(mid.pendingGenerators).toEqual(['mushroom']);
    const frogGen = mid.board[6][6];
    const flowerGen = mid.board[0][0];

    // Two adjacent filler items merge, freeing one cell.
    const merged = gameReducer(mid, {
      type: 'DROP',
      from: { row: 1, col: 0 },
      to: { row: 1, col: 1 },
    });

    expect(countGenerators(merged.board, 'mushroom')).toBe(1);
    expect(merged.pendingGenerators).toEqual([]);
    expect(merged.board[6][6]).toBe(frogGen);
    expect(merged.board[0][0]).toBe(flowerGen);
    // Grants never duplicate: the mushroom generator exists exactly once.
    expect(merged.board.flat().filter((c) => isGenerator(c) && c.chain === 'mushroom')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Save/load compatibility of the new progression
// ---------------------------------------------------------------------------

describe('save/load compatibility', () => {
  it('round-trips a levelled-up game with identical orders, board and progress', () => {
    // Cross into level 3 through real play so unlocks are properly granted.
    const b = createEmptyBoard();
    b[0][0] = createGenerator('flower');
    b[6][6] = createGenerator('frog');
    b[1][1] = createItem('frog', 1);
    const base: GameState = {
      ...createInitialState(null, T0),
      board: b,
      xp: 124,
      level: 2,
      energy: 87,
      starBalance: 40,
      progress: { currentPlot: 1, stars: 40, plotStars: 6, completedOrders: 5 },
      orders: [
        { id: 1, requirements: [req('frog', 1, 1)] },
        { id: 2, requirements: [req('flower', 2, 1)] },
        { id: 3, requirements: [req('frog', 2, 2)] },
      ],
    };
    let state = gameReducer(base, { type: 'SERVE_ORDER', orderId: 1 });
    expect(state.level).toBe(3);

    for (let cycle = 0; cycle < 3; cycle++) {
      expect(saveGame(toPersisted(state))).toBe(true);
      const reloaded = createInitialState(loadGame(), T0);
      // Full-fidelity round trip: nothing heals, drifts or resets.
      expect(toPersisted(reloaded)).toEqual(toPersisted(state));
      expect(reloaded.orders.map(orderKeyOf)).toEqual(state.orders.map(orderKeyOf));
      expect(reloaded.orders.map((o) => o.id)).toEqual(state.orders.map((o) => o.id));
      state = reloaded;
    }
  });

  it('orders generated under the new system stay producible after reload', () => {
    let state = createInitialState(null, T0);
    for (let cycle = 0; cycle < 3; cycle++) {
      saveGame(toPersisted(state));
      const reloaded = createInitialState(loadGame(), T0);
      const boardChains = new Set(
        reloaded.board
          .flat()
          .filter((c): c is Generator => isGenerator(c))
          .map((g) => g.chain),
      );
      expect(boardChains.size).toBeGreaterThan(0);
      for (const r of reloaded.orders.flatMap((o) => o.requirements)) {
        expect(boardChains.has(r.chain)).toBe(true);
      }
      state = reloaded;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Early orders stay energy-feasible
// ---------------------------------------------------------------------------

describe('energy feasibility of early orders', () => {
  it('level 1–2 orders cost at most 8 spawns from scratch', () => {
    // 8 of the 100 starting energy: two tier-2 requirements (2 items × 2
    // spawns each) is the worst case at these levels.
    for (const level of [1, 2]) {
      for (let i = 0; i < 200; i++) {
        for (const order of generateOrderSet(['flower', 'frog'], i, level)) {
          expect(spawnCost(order)).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('no level can generate an order worth more than the starting energy', () => {
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 50; i++) {
        for (const order of generateOrderSet([...CHAINS], i * 2, level)) {
          expect(spawnCost(order)).toBeLessThanOrEqual(ENERGY_CONFIG.startingEnergy);
        }
      }
    }
  });
});
