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
import { resetItemIds } from './board';
import { loadGame, saveGame, clearSave } from '../storage';

beforeEach(() => {
  resetItemIds();
  localStorageMock.clear();
  clearSave();
});

describe('order completion', () => {
  it('removes correct items and awards one star', () => {
    const s0 = createInitialState();
    // place two frog tier1
    const b = s0.board.map((r) => r.slice());
    b[0][0] = { id: 1, chain: 'frog', tier: 1 };
    b[0][1] = { id: 2, chain: 'frog', tier: 1 };
    const state = { ...s0, board: b };
    const orderId = state.orders[0].id;
    // make order match frog tier1
    const orderState = { ...state, orders: [{ id: orderId, chain: 'frog' as any, tier: 1, count: 1 }] };
    const next = gameReducer(orderState, { type: 'SERVE_ORDER', orderId });
    expect(next.starsThisPlot).toBe(1);
    expect(next.progress.stars).toBe(1);
    expect(next.board[0][0]).toBeNull();
  });

  it('does not award star if not fulfillable', () => {
    const s0 = createInitialState();
    const orderId = s0.orders[0].id;
    const orderState = { ...s0, orders: [{ id: orderId, chain: 'frog' as any, tier: 9, count: 1 }] };
    const next = gameReducer(orderState, { type: 'SERVE_ORDER', orderId });
    expect(next.starsThisPlot).toBe(0);
    expect(next.progress.stars).toBe(0);
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
      starsThisPlot: s0.starsThisPlot,
      unlockedPlots: s0.unlockedPlots,
    });
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const s1 = createInitialState(loaded);
    expect(s1.plotIndex).toBe(s0.plotIndex);
    expect(s1.starsThisPlot).toBe(s0.starsThisPlot);
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
});