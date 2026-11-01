import { beforeEach, describe, expect, it } from 'vitest';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import { createInitialState, gameReducer, toPersisted, type GameState } from './state';
import { createEmptyBoard, createGenerator, createItem, resetItemIds } from './board';
import { resetOrderIds } from './orders';
import { clearSave, loadGame, saveGame } from '../storage';
import type { Board, ChainId, Generator } from './types';
import { isGenerator } from './types';

beforeEach(() => {
  resetItemIds();
  resetOrderIds();
  localStorageMock.clear();
  clearSave();
});

function countGenerators(board: Board, chain: ChainId): number {
  return board.flat().filter((c): c is Generator => isGenerator(c)).filter((g) => g.chain === chain).length;
}

function occupiedCells(board: Board): number {
  return board.flat().filter((c) => c !== null).length;
}

/** Board completely filled with tier-1 frog items (49 cells). */
function fullBoard(): Board {
  const b = createEmptyBoard();
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) b[r][c] = createItem('frog', 1);
  return b;
}

/** Places `count` items row-major starting at the first empty cell. */
function placeItems(board: Board, chain: ChainId, tier: number, count: number): void {
  let placed = 0;
  for (let r = 0; r < 7 && placed < count; r++) {
    for (let c = 0; c < 7 && placed < count; c++) {
      if (board[r][c] === null) {
        board[r][c] = createItem(chain, tier);
        placed++;
      }
    }
  }
}

/** State whose only order is fulfillable: frog:1 x1 with one on the board. */
function serveableState(overrides: Partial<GameState>): GameState {
  const b = createEmptyBoard();
  b[0][0] = createItem('frog', 1);
  return {
    ...createInitialState(),
    board: b,
    orders: [{ id: 1, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }],
    ...overrides,
  };
}

describe('unlock schedule on level-up', () => {
  it('grants Plant and Mushroom when completing an order takes Level 2 -> Level 3', () => {
    // 124 xp + 1 xp reward = 125 xp => Level 3
    const state = serveableState({ xp: 124, level: 2 });
    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });

    expect(next.level).toBe(3);
    expect(next.unlockedChains).toEqual(expect.arrayContaining(['plant', 'mushroom']));
    expect(countGenerators(next.board, 'plant')).toBe(1);
    expect(countGenerators(next.board, 'mushroom')).toBe(1);
  });

  it('grants Plant and Mushroom when a garden restoration takes Level 2 -> Level 3', () => {
    // 'branches' costs 3 stars and adds 3 xp: 124 + 3 = 127 => Level 3
    const state = serveableState({ xp: 124, level: 2, starBalance: 3 });
    const next = gameReducer(state, { type: 'RESTORE_TASK', taskId: 'branches' });

    expect(next.level).toBe(3);
    expect(next.unlockedChains).toEqual(expect.arrayContaining(['plant', 'mushroom']));
    expect(countGenerators(next.board, 'plant')).toBe(1);
    expect(countGenerators(next.board, 'mushroom')).toBe(1);
  });

  it('grants Berry exactly once when Level 3 -> Level 4 via order completion', () => {
    // 224 + 1 = 225 xp => Level 4
    const state = serveableState({
      xp: 224,
      level: 3,
      unlockedChains: ['flower', 'frog', 'plant', 'mushroom'],
    });
    // Realistic Level 3 board: the previously granted generators exist.
    const b0 = state.board.map((r) => r.slice());
    b0[6][6] = createGenerator('plant');
    b0[6][5] = createGenerator('mushroom');
    const next = gameReducer({ ...state, board: b0 }, { type: 'SERVE_ORDER', orderId: 1 });

    expect(next.level).toBe(4);
    expect(countGenerators(next.board, 'berry')).toBe(1);

    // Leveling again must not re-grant earlier unlocks.
    const board2 = next.board.map((r) => r.slice());
    board2[6][4] = createItem('frog', 1);
    const again = gameReducer(
      { ...next, board: board2, xp: 349, level: 4, orders: [{ id: 2, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }] },
      { type: 'SERVE_ORDER', orderId: 2 },
    );
    expect(again.level).toBe(5);
    expect(countGenerators(again.board, 'tool')).toBe(1);
    expect(countGenerators(again.board, 'berry')).toBe(1);
    expect(countGenerators(again.board, 'plant')).toBe(1);
    expect(countGenerators(again.board, 'mushroom')).toBe(1);
  });

  it('grants every unlock crossed by a multi-level XP jump in one serve', () => {
    // 124 + 234 xp (13x tool:5 + 13x woodland:5) = 358 => Level 5 (crosses 3, 4, 5)
    const b = createEmptyBoard();
    placeItems(b, 'tool', 5, 13);
    placeItems(b, 'woodland', 5, 13);
    const state: GameState = {
      ...createInitialState(),
      board: b,
      xp: 124,
      level: 2,
      orders: [
        {
          id: 1,
          requirements: [
            { chain: 'tool', tier: 5, count: 13 },
            { chain: 'woodland', tier: 5, count: 13 },
          ],
        },
      ],
    };
    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });

    expect(next.level).toBe(5);
    expect(next.unlockedChains).toEqual(['flower', 'frog', 'plant', 'mushroom', 'berry', 'tool']);
    expect(countGenerators(next.board, 'plant')).toBe(1);
    expect(countGenerators(next.board, 'mushroom')).toBe(1);
    expect(countGenerators(next.board, 'berry')).toBe(1);
    expect(countGenerators(next.board, 'tool')).toBe(1);
  });

  it('grants Woodland when a restoration jumps Level 6 -> Level 7', () => {
    // 688 + 12 xp (greenhouse) = 700 xp => Level 7 (crosses 6, 7; 6 has no unlock)
    const state = serveableState({
      xp: 688,
      level: 6,
      unlockedChains: ['flower', 'frog', 'plant', 'mushroom', 'berry', 'tool'],
      starBalance: 12,
      completedRestoration: ['branches', 'fence', 'flowerbeds'],
    });
    const next = gameReducer(state, { type: 'RESTORE_TASK', taskId: 'greenhouse' });

    expect(next.level).toBe(7);
    expect(countGenerators(next.board, 'woodland')).toBe(1);
  });
});

describe('loading saves', () => {
  it('reconciles a Level 3+ save that is missing its generators, without touching items', () => {
    const b = createEmptyBoard();
    b[2][3] = createItem('berry', 2);
    b[5][1] = createItem('mushroom', 4);
    saveGame({
      version: 1,
      plotIndex: 0,
      board: b,
      orders: [{ id: 9, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }],
      progress: { currentPlot: 1, stars: 0, plotStars: 0, completedOrders: 0 },
      unlockedPlots: [1],
      xp: 130, // Level 3
      // Shape written by the pre-fix build: chains never recorded in-session.
      unlockedChains: ['flower', 'frog'],
    });

    const loaded = createInitialState(loadGame());
    expect(loaded.level).toBe(3);
    expect(loaded.unlockedChains).toEqual(expect.arrayContaining(['plant', 'mushroom']));
    expect(countGenerators(loaded.board, 'plant')).toBe(1);
    expect(countGenerators(loaded.board, 'mushroom')).toBe(1);
    // Existing items untouched, board not replaced.
    expect(loaded.board[2][3]).toEqual(expect.objectContaining({ chain: 'berry', tier: 2 }));
    expect(loaded.board[5][1]).toEqual(expect.objectContaining({ chain: 'mushroom', tier: 4 }));
  });

  it('repeated reloads never duplicate generators', () => {
    const b = createEmptyBoard();
    b[6][6] = createGenerator('plant');
    b[6][5] = createGenerator('mushroom');
    const withGenerators: GameState = {
      ...createInitialState(),
      xp: 130,
      level: 3,
      unlockedChains: ['flower', 'frog', 'plant', 'mushroom'],
      board: b,
    };
    saveGame(toPersisted(withGenerators));

    for (let i = 0; i < 5; i++) {
      const reloaded = createInitialState(loadGame());
      expect(countGenerators(reloaded.board, 'plant')).toBe(1);
      expect(countGenerators(reloaded.board, 'mushroom')).toBe(1);
      expect(reloaded.unlockedChains).toEqual(['flower', 'frog', 'plant', 'mushroom']);
    }
  });

  it('keeps a full-board pending unlock across save/reload', () => {
    // Full board at load: grants cannot be placed, so they must be queued
    // and survive the next save — otherwise they are lost forever (the
    // chains are already recorded, so later loads skip them).
    saveGame({
      version: 1,
      plotIndex: 0,
      board: fullBoard(),
      orders: [{ id: 9, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }],
      progress: { currentPlot: 1, stars: 0, plotStars: 0, completedOrders: 0 },
      unlockedPlots: [1],
      xp: 130, // Level 3
      unlockedChains: ['flower', 'frog'],
    });

    const first = createInitialState(loadGame());
    expect(first.pendingGenerators).toEqual(expect.arrayContaining(['plant', 'mushroom']));
    expect(countGenerators(first.board, 'plant')).toBe(0);

    saveGame(toPersisted(first));
    const second = createInitialState(loadGame());
    expect(second.pendingGenerators).toEqual(expect.arrayContaining(['plant', 'mushroom']));
    expect(countGenerators(second.board, 'plant')).toBe(0);
    expect(occupiedCells(second.board)).toBe(49);
  });
});

describe('full-board pending generator delivery', () => {
  it('delivers a pending generator once a serve frees space, without overwriting items', () => {
    // Level 3 -> 4 while the board is full: Berry must queue, then be placed
    // into the cell freed by consuming the order's item.
    const state: GameState = {
      ...createInitialState(),
      board: fullBoard(),
      xp: 224,
      level: 3,
      unlockedChains: ['flower', 'frog', 'plant', 'mushroom'],
      orders: [{ id: 1, requirements: [{ chain: 'frog', tier: 1, count: 1 }] }],
    };

    const next = gameReducer(state, { type: 'SERVE_ORDER', orderId: 1 });
    expect(next.level).toBe(4);
    // 1 item consumed, 1 generator placed => the board stays exactly full,
    // with 48 original items plus the generator (nothing overwritten).
    expect(occupiedCells(next.board)).toBe(49);
    expect(next.board.flat().filter((c) => c !== null && !isGenerator(c)).length).toBe(48);
    expect(countGenerators(next.board, 'berry')).toBe(1);
    expect(next.pendingGenerators).not.toContain('berry');

    // Space from a later merge must not award Berry a second time.
    const merged = gameReducer(next, { type: 'DROP', from: { row: 1, col: 0 }, to: { row: 1, col: 1 } });
    // merge: 49 occupied - 2 consumed + 1 spawned = 48
    expect(occupiedCells(merged.board)).toBe(48);
    expect(countGenerators(merged.board, 'berry')).toBe(1);
  });
});
