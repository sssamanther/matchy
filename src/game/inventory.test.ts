import { beforeEach, describe, expect, it } from 'vitest';

// In-memory localStorage (same pattern as state.test.ts).
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

import { createInitialState, gameReducer, toPersisted, type GameState } from './state';
import { createEmptyBoard, createGenerator, resetItemIds } from './board';
import { canFulfill } from './orders';
import { STORAGE_BASE_CAPACITY, countStored, createStorage } from './inventory';
import { loadGame, saveGame, clearSave } from '../storage';
import { isItem, type Cell, type Item } from './types';

const T0 = 1_000_000;

beforeEach(() => {
  resetItemIds();
  localStorageMock.clear();
  clearSave();
});

/** Fresh game whose board contains exactly the given cells (no generators). */
function stateWith(cells: Array<[number, number, Cell]>): GameState {
  const b = createEmptyBoard();
  for (const [r, c, cell] of cells) b[r][c] = cell;
  return { ...createInitialState(null, T0), board: b };
}

function filledStorage(prefix: number): (Item | null)[] {
  return Array.from({ length: STORAGE_BASE_CAPACITY }, (_, i): Item => ({
    id: prefix + i,
    chain: 'frog',
    tier: 1,
  }));
}

/** Every regular-item id on the board plus in storage — used to prove no item is ever lost or duplicated. */
function allItemIds(s: GameState): number[] {
  const boardIds = s.board.flat().filter((c): c is Item => c !== null && isItem(c)).map((c) => c.id);
  const storageIds = s.storageSlots.filter((c): c is Item => c !== null).map((c) => c.id);
  return [...boardIds, ...storageIds].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Selection (UI-only, transient)
// ---------------------------------------------------------------------------

describe('item selection', () => {
  it('selects a regular item on tap', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 2 }]]);
    const next = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    expect(next.selected).toEqual({ pos: { row: 0, col: 0 }, id: 10 });
    expect(next.board).toBe(s.board); // selection never mutates the board
  });

  it('switches the selection to another item', () => {
    const s = stateWith([
      [0, 0, { id: 10, chain: 'frog', tier: 2 }],
      [1, 1, { id: 11, chain: 'flower', tier: 1 }],
    ]);
    const first = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const second = gameReducer(first, { type: 'SELECT_CELL', pos: { row: 1, col: 1 } });
    expect(second.selected).toEqual({ pos: { row: 1, col: 1 }, id: 11 });
  });

  it('clears the selection when an empty tile is tapped', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 2 }]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const cleared = gameReducer(selected, { type: 'SELECT_CELL', pos: { row: 6, col: 6 } });
    expect(cleared.selected).toBeNull();
  });

  it('re-tapping the selected item is a no-op', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 2 }]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const again = gameReducer(selected, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    expect(again).toBe(selected);
  });

  it('never selects generators (they keep their own tap behaviour)', () => {
    const b = createEmptyBoard();
    b[2][2] = createGenerator('flower');
    const s: GameState = { ...createInitialState(null, T0), board: b };
    const next = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 2, col: 2 } });
    expect(next.selected).toBeNull();
    expect(next).toBe(s); // no prior selection: nothing changes at all
  });

  it('handles out-of-bounds positions safely (clears, no crash)', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 2 }]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const next = gameReducer(selected, { type: 'SELECT_CELL', pos: { row: 99, col: 99 } });
    expect(next.selected).toBeNull();
  });

  it('clears the selection when the selected item is moved', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 1 }]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const next = gameReducer(selected, { type: 'DROP', from: { row: 0, col: 0 }, to: { row: 3, col: 3 } });
    expect(next.board[3][3]?.id).toBe(10); // moved...
    expect(next.selected).toBeNull(); // ...and deselected
  });

  it('clears the selection when the selected item merges away', () => {
    const s = stateWith([
      [0, 0, { id: 10, chain: 'frog', tier: 1 }],
      [0, 1, { id: 11, chain: 'frog', tier: 1 }],
    ]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const next = gameReducer(selected, { type: 'DROP', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } });
    expect(next.board[0][0]).toBeNull();
    expect((next.board[0][1] as Item).tier).toBe(2);
    expect(next.selected).toBeNull();
  });

  it('clears the selection when another item merges onto it', () => {
    const s = stateWith([
      [0, 0, { id: 10, chain: 'frog', tier: 1 }],
      [4, 4, { id: 11, chain: 'frog', tier: 1 }],
    ]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const next = gameReducer(selected, { type: 'DROP', from: { row: 4, col: 4 }, to: { row: 0, col: 0 } });
    expect((next.board[0][0] as Item).id).not.toBe(10); // replacement item
    expect(next.selected).toBeNull();
  });

  it('keeps the selection while an unrelated merge happens elsewhere', () => {
    const s = stateWith([
      [0, 0, { id: 10, chain: 'flower', tier: 3 }],
      [5, 5, { id: 11, chain: 'frog', tier: 1 }],
      [5, 6, { id: 12, chain: 'frog', tier: 1 }],
    ]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const next = gameReducer(selected, { type: 'DROP', from: { row: 5, col: 5 }, to: { row: 5, col: 6 } });
    expect((next.board[5][6] as Item).tier).toBe(2); // merge still worked
    expect(next.selected).toEqual({ pos: { row: 0, col: 0 }, id: 10 });
  });

  it('clears the selection when the selected item is consumed by an order', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 1 }]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const withOrder: GameState = {
      ...selected,
      orders: [{ id: 7, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }],
    };
    const next = gameReducer(withOrder, { type: 'SERVE_ORDER', orderId: 7 });
    expect(next.board[0][0]).toBeNull();
    expect(next.selected).toBeNull();
  });

  it('never persists the selection', () => {
    const s = stateWith([[0, 0, { id: 10, chain: 'frog', tier: 2 }]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 0, col: 0 } });
    const persisted = toPersisted(selected);
    expect(persisted).not.toHaveProperty('selected');
    expect(persisted).toHaveProperty('storageSlots'); // storage IS persisted
  });
});

// ---------------------------------------------------------------------------
// Storing items
// ---------------------------------------------------------------------------

describe('storing items', () => {
  it('moves a regular item from the board into the first free slot, preserving identity', () => {
    const item: Item = { id: 20, chain: 'flower', tier: 3 };
    const s = stateWith([[2, 2, item]]);
    const selected = gameReducer(s, { type: 'SELECT_CELL', pos: { row: 2, col: 2 } });
    const next = gameReducer(selected, { type: 'STORE_ITEM', pos: { row: 2, col: 2 } });
    expect(next.board[2][2]).toBeNull();
    expect(next.storageSlots[0]).toEqual(item); // same id/chain/tier
    expect(countStored(next.storageSlots)).toBe(1);
    expect(next.selected).toBeNull(); // stored item left the board
  });

  it('fills the first available slot, leaving later free slots empty', () => {
    const s: GameState = {
      ...stateWith([[0, 0, { id: 21, chain: 'berry', tier: 1 }]]),
      storageSlots: [{ id: 90, chain: 'frog', tier: 2 }, null, null, null, null, null, null, null],
    };
    const next = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 0, col: 0 } });
    expect(next.storageSlots[0]?.id).toBe(90); // untouched
    expect(next.storageSlots[1]?.id).toBe(21); // stored in the first free slot
    expect(next.storageSlots.slice(2).every((x) => x === null)).toBe(true);
  });

  it('refuses to store when storage is full — board untouched, state identical', () => {
    const s: GameState = {
      ...stateWith([[0, 0, { id: 22, chain: 'tool', tier: 1 }]]),
      storageSlots: filledStorage(100),
    };
    const next = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 0, col: 0 } });
    expect(next).toBe(s); // invalid action returns unchanged state
    expect(next.board[0][0]?.id).toBe(22); // item still safely on the board
    expect(countStored(next.storageSlots)).toBe(STORAGE_BASE_CAPACITY);
  });

  it('rejects generators', () => {
    const b = createEmptyBoard();
    b[1][1] = createGenerator('mushroom');
    const s: GameState = { ...createInitialState(null, T0), board: b };
    const next = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 1, col: 1 } });
    expect(next).toBe(s);
    expect(countStored(next.storageSlots)).toBe(0);
    expect(next.board[1][1]).not.toBeNull(); // generator stays put
  });

  it('rejects empty cells and out-of-bounds positions', () => {
    const s = stateWith([]);
    expect(gameReducer(s, { type: 'STORE_ITEM', pos: { row: 5, col: 5 } })).toBe(s);
    expect(gameReducer(s, { type: 'STORE_ITEM', pos: { row: 99, col: 0 } })).toBe(s);
  });

  it('stored items cannot fulfill orders while in storage', () => {
    const s: GameState = {
      ...stateWith([]), // board has no frog items at all
      storageSlots: [{ id: 30, chain: 'frog', tier: 1 }, null, null, null, null, null, null, null],
      orders: [{ id: 8, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }],
    };
    expect(canFulfill(s.board, s.orders[0])).toBe(false);
    const next = gameReducer(s, { type: 'SERVE_ORDER', orderId: 8 });
    expect(next).toBe(s); // refused — no reward, no order swap
  });

  it('RESET clears the storage along with everything else', () => {
    const s: GameState = {
      ...stateWith([[0, 0, { id: 40, chain: 'frog', tier: 1 }]]),
      storageSlots: filledStorage(200),
    };
    const stored = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 0, col: 0 } });
    const reset = gameReducer(stored, { type: 'RESET' });
    expect(reset.storageCapacity).toBe(STORAGE_BASE_CAPACITY);
    expect(reset.storageSlots).toEqual(createStorage(STORAGE_BASE_CAPACITY));
  });
});

// ---------------------------------------------------------------------------
// Retrieving items
// ---------------------------------------------------------------------------

describe('retrieving items', () => {
  it('places the item on the first free board tile (deterministic row-major)', () => {
    const stored: Item = { id: 40, chain: 'berry', tier: 4 };
    const s: GameState = {
      ...stateWith([[0, 0, { id: 39, chain: 'plant', tier: 2 }]]), // (0,0) taken
      storageSlots: [stored, null, null, null, null, null, null, null],
    };
    const next = gameReducer(s, { type: 'RETRIEVE_ITEM', index: 0 });
    expect(next.board[0][0]?.id).toBe(39); // existing item untouched
    expect(next.board[0][1]).toEqual(stored); // first free tile in row-major order
    expect(next.storageSlots[0]).toBeNull();
    expect(countStored(next.storageSlots)).toBe(0);
  });

  it('refuses retrieval when the board is full — item stays safely in storage', () => {
    const b = createEmptyBoard();
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) b[r][c] = { id: 1000 + r * 7 + c, chain: 'plant', tier: 1 };
    }
    const stored: Item = { id: 41, chain: 'mushroom', tier: 5 };
    const s: GameState = {
      ...createInitialState(null, T0),
      board: b,
      storageSlots: [stored, null, null, null, null, null, null, null],
    };
    const next = gameReducer(s, { type: 'RETRIEVE_ITEM', index: 0 });
    expect(next).toBe(s); // invalid action returns unchanged state
    expect(next.storageSlots[0]).toEqual(stored); // still in storage — no loss
    expect(next.board.flat().filter((c) => c !== null)).toHaveLength(49);
  });

  it('refuses empty and out-of-range slots', () => {
    const s = stateWith([]);
    expect(gameReducer(s, { type: 'RETRIEVE_ITEM', index: 0 })).toBe(s);
    expect(gameReducer(s, { type: 'RETRIEVE_ITEM', index: 99 })).toBe(s);
  });

  it('never duplicates or loses an item across store/retrieve round trips', () => {
    const item: Item = { id: 50, chain: 'frog', tier: 3 };
    const s = stateWith([[2, 2, item]]);
    const before = allItemIds(s);
    const stored = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 2, col: 2 } });
    expect(allItemIds(stored)).toEqual(before); // same multiset after storing
    const back = gameReducer(stored, { type: 'RETRIEVE_ITEM', index: 0 });
    expect(allItemIds(back)).toEqual(before); // same multiset after retrieving
    expect(back.board[2][2] ?? back.board[0][0]).toBeDefined();
    expect(back.storageSlots.every((x) => x === null)).toBe(true);
    // exactly one copy of the item exists anywhere
    const copies = allItemIds(back).filter((id) => id === 50);
    expect(copies).toHaveLength(1);
  });

  it('keeps storage contents across a plot switch (player-level inventory)', () => {
    const s: GameState = {
      ...stateWith([[0, 0, { id: 60, chain: 'frog', tier: 1 }]]),
      unlockedPlots: [1, 2],
    };
    const stored = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 0, col: 0 } });
    const switched = gameReducer(stored, { type: 'SELECT_PLOT', index: 1 });
    expect(switched.storageSlots).toEqual(stored.storageSlots);
    expect(switched.selected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Save compatibility
// ---------------------------------------------------------------------------

describe('storage persistence and compatibility', () => {
  it('starts with 8 empty slots at capacity 8', () => {
    const s = createInitialState(null, T0);
    expect(s.storageCapacity).toBe(8);
    expect(s.storageSlots).toHaveLength(8);
    expect(s.storageSlots.every((x) => x === null)).toBe(true);
    expect(s.selected).toBeNull();
  });

  it('round-trips stored items through save/load', () => {
    let s = stateWith([
      [0, 0, { id: 70, chain: 'flower', tier: 2 }],
      [0, 1, { id: 71, chain: 'mushroom', tier: 4 }],
    ]);
    // Pin an explicit order set so the comparison is fully deterministic
    // (load-time reconcile only ever heals duplicate requirement sets).
    s = { ...s, orders: [{ id: 1, requirements: [{ chain: 'flower', tier: 2, count: 1 }] }] };
    s = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 0, col: 0 } });
    s = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 0, col: 1 } });
    expect(countStored(s.storageSlots)).toBe(2);

    saveGame(toPersisted(s));
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const resumed = createInitialState(loaded, T0);
    expect(resumed.storageCapacity).toBe(8);
    expect(resumed.storageSlots).toEqual(s.storageSlots);
    expect(toPersisted(resumed)).toEqual(toPersisted(s));
  });

  it('loads legacy saves without storage fields as empty 8-slot storage', () => {
    const s0 = createInitialState(null, T0);
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
    expect(loaded!.storageSlots).toBeUndefined(); // old shape untouched
    const resumed = createInitialState(loaded, T0);
    expect(resumed.storageCapacity).toBe(STORAGE_BASE_CAPACITY);
    expect(resumed.storageSlots).toEqual(new Array(8).fill(null));
    expect(countStored(resumed.storageSlots)).toBe(0);
    expect(resumed.board).toEqual(s0.board);
    expect(resumed.orders).toEqual(s0.orders);
  });

  it('rejects saves whose storage slots are malformed', () => {
    const core = toPersisted(createInitialState(null, T0));
    localStorageMock.setItem(
      'matchy:save',
      JSON.stringify({ version: 1, data: { ...core, storageSlots: 'nope' } }),
    );
    expect(loadGame()).toBeNull();
  });

  it('rejects saves that smuggle a generator into storage', () => {
    const core = toPersisted(createInitialState(null, T0));
    localStorageMock.setItem(
      'matchy:save',
      JSON.stringify({ version: 1, data: { ...core, storageSlots: [{ id: 1, kind: 'generator', chain: 'frog' }] } }),
    );
    expect(loadGame()).toBeNull();
  });

  it('sanitizes a nonsensical capacity instead of corrupting storage', () => {
    const core = toPersisted(createInitialState(null, T0));
    localStorageMock.setItem(
      'matchy:save',
      JSON.stringify({ version: 1, data: { ...core, storageCapacity: -3 } }),
    );
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const resumed = createInitialState(loaded, T0);
    expect(resumed.storageCapacity).toBe(STORAGE_BASE_CAPACITY);
    expect(resumed.storageSlots).toHaveLength(8);
  });

  it('round-trips a mixed board+storage game without touching item identities', () => {
    const item: Item = { id: 80, chain: 'woodland', tier: 2 };
    let s = stateWith([[6, 6, item]]);
    s = gameReducer(s, { type: 'STORE_ITEM', pos: { row: 6, col: 6 } });
    const idsBefore = allItemIds(s);
    saveGame(toPersisted(s));
    const resumed = createInitialState(loadGame(), T0);
    expect(allItemIds(resumed)).toEqual(idsBefore);
    expect(resumed.storageSlots[0]).toEqual(item);
  });
});
