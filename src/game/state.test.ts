import { beforeEach, describe, expect, it } from 'vitest';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import { createInitialState, gameReducer } from './state';
import { resetItemIds, createItem } from './board';
import { loadGame, saveGame, clearSave } from '../storage';

beforeEach(() => {
  resetItemIds();
  localStorageMock.clear();
  clearSave();
});

describe('order completion', () => {
  it('removes correct items and awards one star', () => {
    const s0 = createInitialState();
    const b = s0.board.map((r) => r.slice());
    b[0][0] = { id: 1, chain: 'frog', tier: 1 };
    b[0][1] = { id: 2, chain: 'frog', tier: 1 };
    const state = { ...s0, board: b };
    const orderId = state.orders[0].id;
    const orderState = { ...state, orders: [{ id: orderId, chain: 'frog' as any, tier: 1, count: 1 }] };
    const next = gameReducer(orderState, { type: 'SERVE_ORDER', orderId });
    expect(next.progress.plotStars).toBe(1);
    expect(next.progress.stars).toBe(1);
    expect(next.board[0][0]).toBeNull();
  });

  it('does not award star if not fulfillable', () => {
    const s0 = createInitialState();
    const orderId = s0.orders[0].id;
    const orderState = { ...s0, orders: [{ id: orderId, chain: 'frog' as any, tier: 9, count: 1 }] };
    const next = gameReducer(orderState, { type: 'SERVE_ORDER', orderId });
    expect(next.progress.plotStars).toBe(0);
    expect(next.progress.stars).toBe(0);
  });

  it('awards exactly once on repeated attempts', () => {
    const s0 = createInitialState();
    const b = s0.board.map((r) => r.slice());
    b[0][0] = { id: 1, chain: 'frog', tier: 1 };
    const state = { ...s0, board: b };
    const orderId = state.orders[0].id;
    const orderState = { ...state, orders: [{ id: orderId, chain: 'frog' as any, tier: 1, count: 1 }] };
    const next1 = gameReducer(orderState, { type: 'SERVE_ORDER', orderId });
    const next2 = gameReducer(next1, { type: 'SERVE_ORDER', orderId });
    // second attempt: order replaced; old orderId no longer exists -> no extra star
    expect(next2.progress.stars).toBe(next1.progress.stars);
  });
});

describe('saving/restoring', () => {
  it('round-trips a complete game', () => {
    const s0 = createInitialState();
    saveGame({
      version: s0.version,
      plotIndex: s0.plotIndex,
      board: s0.board,
      orders: s0.orders,
      progress: s0.progress,
      unlockedPlots: s0.unlockedPlots,
    });
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const s1 = createInitialState(loaded);
    expect(s1.plotIndex).toBe(s0.plotIndex);
  });

  it('restores board with items in specific positions', () => {
    const s0 = createInitialState();
    const b = s0.board.map((r) => r.slice());
    b[2][3] = createItem('berry', 2);
    b[5][1] = createItem('mushroom', 4);
    const saved = {
      version: s0.version,
      plotIndex: s0.plotIndex,
      board: b,
      orders: s0.orders,
      progress: s0.progress,
      unlockedPlots: s0.unlockedPlots,
    };
    saveGame(saved);
    const loaded = loadGame();
    const s1 = createInitialState(loaded);
    expect(s1.board[2][3]?.chain).toBe('berry');
    expect(s1.board[2][3]?.tier).toBe(2);
    expect(s1.board[5][1]?.chain).toBe('mushroom');
    expect(s1.board[5][1]?.tier).toBe(4);
  });

  it('restores active orders and unlocked plots', () => {
    const s0 = createInitialState();
    const orders = [{ id: 99, chain: 'frog' as any, tier: 1, count: 2 }];
    const saved = {
      version: s0.version,
      plotIndex: 1,
      board: s0.board,
      orders,
      progress: { ...s0.progress, currentPlot: 2 },
      unlockedPlots: [1, 2],
    };
    saveGame(saved);
    const loaded = loadGame();
    const s1 = createInitialState(loaded);
    expect(s1.orders).toEqual(orders);
    expect(s1.unlockedPlots).toEqual([1, 2]);
    expect(s1.plotIndex).toBe(1);
  });
});

describe('plot switching', () => {
  it('switches between unlocked plots', () => {
    const s0 = createInitialState();
    const unlocked = { ...s0, unlockedPlots: [1, 2] };
    const s1 = gameReducer(unlocked, { type: 'SELECT_PLOT', index: 1 });
    expect(s1.plotIndex).toBe(1);
  });

  it('cannot select a locked plot', () => {
    const s0 = createInitialState(); // only plot 1 unlocked
    const s1 = gameReducer(s0, { type: 'SELECT_PLOT', index: 2 });
    expect(s1.plotIndex).toBe(s0.plotIndex);
  });
});

describe('refresh/resume rewards', () => {
  it('completing order then reloading keeps rewards', () => {
    const s0 = createInitialState();
    const b = s0.board.map((r) => r.slice());
    b[0][0] = { id: 1, chain: 'frog', tier: 1 };
    const state = { ...s0, board: b };
    const orderId = state.orders[0].id;
    const orderState = { ...state, orders: [{ id: orderId, chain: 'frog' as any, tier: 1, count: 1 }] };
    const next = gameReducer(orderState, { type: 'SERVE_ORDER', orderId });
    saveGame({
      version: next.version,
      plotIndex: next.plotIndex,
      board: next.board,
      orders: next.orders,
      progress: next.progress,
      unlockedPlots: next.unlockedPlots,
    });
    const loaded = loadGame();
    const resumed = createInitialState(loaded);
    expect(resumed.progress.stars).toBe(1);
    expect(resumed.progress.plotStars).toBe(1);
  });
});

describe('invalid save data', () => {
  it('returns null for corrupted JSON', () => {
    localStorage.setItem('matchy:save', '{bad json');
    expect(loadGame()).toBeNull();
  });
  it('returns null for wrong shape', () => {
    localStorage.setItem('matchy:save', JSON.stringify({ version: 1, data: { foo: 1 } }));
    expect(loadGame()).toBeNull();
  });
  it('returns null for invalid nested board', () => {
    localStorage.setItem('matchy:save', JSON.stringify({
      version: 1,
      data: {
        plotIndex: 0,
        board: [[{ id: 1 }]],
        orders: [],
        progress: { currentPlot: 1, stars: 0, plotStars: 0 },
        unlockedPlots: [1],
      },
    }));
    expect(loadGame()).toBeNull();
  });
});