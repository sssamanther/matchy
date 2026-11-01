import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installLifecycleSaveFlush, loadGame, saveGame } from './storage';
import { createInitialState, gameReducer, toPersisted, type GameState } from './game/state';
import { resetItemIds } from './game/board';
import { PLOTS } from './game/plots';

// In-memory localStorage (same pattern as state.test.ts).
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

const T0 = 1_000_000;

beforeEach(() => {
  resetItemIds();
  localStorageMock.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Mirrors the real app flow: a burst of rapid consecutive actions
 * (order serves + generator taps), each followed by the save the
 * persist effect performs after every state change.
 */
function playBurst(stateCount = 6): GameState {
  let s = createInitialState(null, T0);
  for (let i = 0; i < stateCount; i++) {
    // put a mergeable item on the board and serve an order (like the player
    // tapping "Complete" rapidly), then tap a generator
    const board = s.board.map((r) => r.slice());
    board[0][0] = { id: 500 + i, chain: 'frog', tier: 1 };
    const orderId = 900 + i;
    s = { ...s, board, orders: [{ id: orderId, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }] };
    s = gameReducer(s, { type: 'SERVE_ORDER', orderId });
    s = gameReducer(s, { type: 'TAP_GENERATOR', pos: PLOTS[0].sources[0].pos });
    saveGame(toPersisted(s)); // what the persist effect does after each action
  }
  return s;
}

describe('rapid consecutive actions (incident regression)', () => {
  it('storage always matches the latest state after every action', () => {
    let s = createInitialState(null, T0);
    for (let i = 0; i < 12; i++) {
      s = gameReducer(s, { type: 'TAP_SOURCE', index: i % PLOTS[0].sources.length });
      saveGame(toPersisted(s));
      expect(loadGame()).toEqual(toPersisted(s));
    }
  });

  it('a rapid serve burst keeps storage in lockstep (no dropped saves)', () => {
    const final = playBurst(6);
    expect(final.progress.completedOrders).toBe(6);
    expect(loadGame()).toEqual(toPersisted(final));
  });

  it('reload after a rapid burst restores the exact final state (hard-kill simulation)', () => {
    const final = playBurst(6);
    // simulate SIGKILL: no cleanup runs; a new process only sees storage
    const reloaded = createInitialState(loadGame(), final.energyUpdatedAt);
    expect(toPersisted(reloaded)).toEqual(toPersisted(final));
    expect(reloaded.progress.stars).toBe(final.progress.stars);
    expect(reloaded.xp).toBe(final.xp);
    expect(reloaded.level).toBe(final.level);
    expect(reloaded.energy).toBe(final.energy);
    expect(reloaded.board).toEqual(final.board);
    expect(reloaded.orders).toEqual(final.orders);
  });
});

describe('saveGame write-failure handling (2026-11-01 incident regression)', () => {
  it('saves successfully and returns true on the happy path', () => {
    const s = createInitialState(null, T0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(saveGame(toPersisted(s))).toBe(true);
    expect(err).not.toHaveBeenCalled();
    expect(loadGame()).toEqual(toPersisted(s));
  });

  it('retries a transient setItem failure and still saves (no error logged)', () => {
    const s = createInitialState(null, T0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const original = localStorageMock.setItem;
    vi.spyOn(localStorageMock, 'setItem').mockImplementation((k, v) => {
      if (calls++ === 0) throw new Error('transient');
      original(k, v);
    });
    expect(saveGame(toPersisted(s))).toBe(true);
    expect(err).not.toHaveBeenCalled();
    expect(loadGame()).toEqual(toPersisted(s));
  });

  it('detects a silently-dropped write via read-back verification and reports it', () => {
    // The incident class: setItem returns without error but nothing is
    // stored. Without verification this lost ~52s of progress in silence.
    const s = createInitialState(null, T0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => { /* dropped */ });
    expect(saveGame(toPersisted(s))).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('SAVE FAILED');
    expect(loadGame()).toBeNull();
  });

  it('recovers when a dropped write succeeds on retry', () => {
    const s = createInitialState(null, T0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const original = localStorageMock.setItem;
    vi.spyOn(localStorageMock, 'setItem').mockImplementation((k, v) => {
      if (calls++ === 0) return; // first write silently dropped
      original(k, v);
    });
    expect(saveGame(toPersisted(s))).toBe(true);
    expect(err).not.toHaveBeenCalled();
    expect(loadGame()).toEqual(toPersisted(s));
  });

  it('reports persistent setItem failures instead of swallowing them', () => {
    const s = createInitialState(null, T0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveGame(toPersisted(s))).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('SAVE FAILED');
  });

  it('reports serialization failures instead of swallowing them', () => {
    const s = createInitialState(null, T0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { ...toPersisted(s), progress: { ...s.progress, stars: 1n } };
    expect(saveGame(broken as never)).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('keeps the save key and envelope format unchanged (existing saves compatible)', () => {
    const s = createInitialState(null, T0);
    saveGame(toPersisted(s));
    expect(Object.keys(store)).toEqual(['matchy:save']);
    const envelope = JSON.parse(store['matchy:save']) as { version: number; data: Record<string, unknown> };
    expect(envelope.version).toBe(1);
    expect(envelope.data.plotIndex).toBe(s.plotIndex);
    expect(envelope.data.board).toEqual(s.board);
  });
});

describe('lifecycle save flush on background/teardown', () => {
  function fakeTargets() {
    const listeners: Record<string, Array<() => void>> = {};
    const on = (t: string, l: () => void) => { (listeners[t] ??= []).push(l); };
    const off = (t: string, l: () => void) => { listeners[t] = (listeners[t] ?? []).filter((f) => f !== l); };
    const doc = { visibilityState: 'visible' as string, addEventListener: on, removeEventListener: off };
    const win = { addEventListener: on, removeEventListener: off };
    return { doc, win, fire: (t: string) => [...(listeners[t] ?? [])].forEach((f) => f()) };
  }

  it('saves the latest snapshot when visibility turns hidden', () => {
    const { doc, win, fire } = fakeTargets();
    const final = playBurst(2);
    localStorageMock.clear(); // pretend storage was lost since the last action
    const uninstall = installLifecycleSaveFlush(() => toPersisted(final), doc as never, win as never);
    doc.visibilityState = 'visible';
    fire('visibilitychange');
    expect(loadGame()).toBeNull();
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    expect(loadGame()).toEqual(toPersisted(final));
    uninstall();
  });

  it('saves on pagehide and stops after uninstall', () => {
    const { doc, win, fire } = fakeTargets();
    const final = playBurst(2);
    const uninstall = installLifecycleSaveFlush(() => toPersisted(final), doc as never, win as never);
    localStorageMock.clear();
    fire('pagehide');
    expect(loadGame()).toEqual(toPersisted(final));
    uninstall();
    localStorageMock.clear();
    fire('pagehide');
    expect(loadGame()).toBeNull();
  });

  it('does not save when the snapshot is null', () => {
    const { doc, win, fire } = fakeTargets();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const uninstall = installLifecycleSaveFlush(() => null, doc as never, win as never);
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    fire('pagehide');
    expect(loadGame()).toBeNull();
    expect(err).not.toHaveBeenCalled();
    uninstall();
  });

  it('is a no-op without a DOM (safe in non-browser environments)', () => {
    const uninstall = installLifecycleSaveFlush(() => null, null, null);
    expect(typeof uninstall).toBe('function');
    uninstall();
  });
});
