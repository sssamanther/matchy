import { beforeEach, describe, expect, it } from 'vitest';
import {
  boardFromRows,
  createEmptyBoard,
  createGenerator,
  emptyCells,
  findMergeHint,
  generatorSpawnCell,
  hasMergePair,
  mergeAt,
  resetItemIds,
  spawnItem,
} from './board';
import { isGenerator } from './types';
import { GRID_SIZE } from './types';

beforeEach(() => {
  resetItemIds();
});

describe('mergeAt', () => {
  it('moves an item onto an empty cell', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 1, col: 1 });
    expect(res.kind).toBe('move');
    expect(res.board[1][1]?.chain).toBe('frog');
    expect(res.board[0][0]).toBeNull();
  });

  it('merges two identical items into next tier', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    board[0][1] = { id: 2, chain: 'frog', tier: 1 };
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('merge');
    expect((res.board[0][1] as any)?.tier).toBe(2);
    expect(res.board[0][0]).toBeNull();
    expect(res.consumed).toBe(2);
  });

  it('does not merge different chains', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    board[0][1] = { id: 2, chain: 'flower', tier: 1 };
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('none');
  });

  it('does not tier up past max tier', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 5 };
    board[0][1] = { id: 2, chain: 'frog', tier: 5 };
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('none');
  });

  it('merge-5 bonus spawns two next-tier items', () => {
    // 5 frog tier-1 in a row connected
    const rows: (string | null)[][] = [];
    for (let r = 0; r < GRID_SIZE; r++) rows.push(new Array(GRID_SIZE).fill(null));
    for (let c = 0; c < 5; c++) rows[0][c] = 'frog:1';
    const board = boardFromRows(rows);
    // drag sixth? we only have 5; drag one onto another within cluster
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('merge');
    expect(res.spawned.length).toBe(2);
    expect(res.consumed).toBe(5);
  });
});

describe('hasMergePair / findMergeHint', () => {
  it('detects a mergeable pair', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    board[2][2] = { id: 2, chain: 'frog', tier: 1 };
    expect(hasMergePair(board)).toBe(true);
    expect(findMergeHint(board)).not.toBeNull();
  });

  it('returns false when no duplicates', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    board[0][1] = { id: 2, chain: 'flower', tier: 1 };
    expect(hasMergePair(board)).toBe(false);
    expect(findMergeHint(board)).toBeNull();
  });
});

describe('spawnItem', () => {
  it('spawns into requested empty cell', () => {
    const board = createEmptyBoard();
    const res = spawnItem(board, 'berry', 1, { row: 3, col: 3 });
    expect(res.pos).toEqual({ row: 3, col: 3 });
    expect(res.board[3][3]?.chain).toBe('berry');
  });

  it('returns null pos when board full', () => {
    const board = createEmptyBoard();
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) board[r][c] = { id: r * 7 + c + 1, chain: 'frog', tier: 1 };
    const res = spawnItem(board, 'berry');
    expect(res.pos).toBeNull();
  });
});

describe('merge-2 regression', () => {
  it('merging one pair leaves other identical items unchanged', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    board[0][1] = { id: 2, chain: 'frog', tier: 1 };
    board[0][2] = { id: 3, chain: 'frog', tier: 1 };
    board[0][3] = { id: 4, chain: 'frog', tier: 1 };
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('merge');
    // one tier2 at to
    expect((res.board[0][1] as any)?.tier).toBe(2);
    // two remaining tier1
    const remaining = res.board.flat().filter((c) => c && 'tier' in c && c.tier === 1);
    expect(remaining.length).toBe(2);
  });

  it('invalid merge leaves board unchanged', () => {
    const board = createEmptyBoard();
    board[0][0] = { id: 1, chain: 'frog', tier: 1 };
    board[0][1] = { id: 2, chain: 'flower', tier: 1 };
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('none');
    expect(res.board[0][0]?.id).toBe(1);
  });
});

describe('emptyCells', () => {
  it('counts holes', () => {
    const board = createEmptyBoard();
    expect(emptyCells(board).length).toBe(GRID_SIZE * GRID_SIZE);
  });
});

describe('generators', () => {
  it('occupy cells and are detected', () => {
    const board = createEmptyBoard();
    board[1][1] = createGenerator('flower');
    expect(isGenerator(board[1][1])).toBe(true);
    expect(emptyCells(board).length).toBe(GRID_SIZE * GRID_SIZE - 1);
  });

  it('generatorSpawnCell picks first empty neighbor', () => {
    const board = createEmptyBoard();
    board[1][1] = createGenerator('flower');
    const pos = generatorSpawnCell(board, { row: 1, col: 1 });
    expect(pos).not.toBeNull();
  });

  it('returns null when surrounded', () => {
    const board = createEmptyBoard();
    board[1][1] = createGenerator('flower');
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as const) {
      board[1+dr][1+dc] = { id: 999, chain: 'frog', tier: 1 };
    }
    expect(generatorSpawnCell(board, { row: 1, col: 1 })).toBeNull();
  });

  it('generators cannot be merged or moved', () => {
    const board = createEmptyBoard();
    board[0][0] = createGenerator('flower');
    board[0][1] = createGenerator('flower');
    const res = mergeAt(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.kind).toBe('none');
    // move attempt
    const res2 = mergeAt(board, { row: 0, col: 0 }, { row: 1, col: 1 });
    expect(res2.kind).toBe('none');
  });
});