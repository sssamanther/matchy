/**
 * Pure board engine for Matchy (merge-2).
 *
 * Items sit on a fixed 7x7 grid. Rearranging moves an item into an empty cell;
 * merging consumes two (or more) identical items and produces the next tier.
 * No gravity/refill — the board is a free-form playfield.
 */

import {
  CHAINS,
  CHAIN_TIER_COUNT,
  GRID_SIZE,
  type Board,
  type Cell,
  type ChainId,
  type Item,
  type Position,
} from './types';

let nextItemId = 1;

/** Test helper — keeps ids deterministic across test runs. */
export function resetItemIds(): void {
  nextItemId = 1;
}

/** Back-compat alias used by older tests. */
export const resetTileIds = resetItemIds;

function makeItem(chain: ChainId, tier: number, spawnRow?: number): Item {
  const item: Item = { id: nextItemId++, chain, tier };
  if (spawnRow !== undefined) item.spawnRow = spawnRow;
  return item;
}

function inBounds(pos: Position): boolean {
  return pos.row >= 0 && pos.row < GRID_SIZE && pos.col >= 0 && pos.col < GRID_SIZE;
}

function sameItem(a: Item | null, b: Item | null): boolean {
  return a !== null && b !== null && a.chain === b.chain && a.tier === b.tier;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function emptyCells(board: Board): Position[] {
  const out: Position[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (board[row][col] === null) out.push({ row, col });
    }
  }
  return out;
}

export function isFull(board: Board): boolean {
  return emptyCells(board).length === 0;
}

/** Does at least one mergeable pair exist anywhere on the board? */
export function hasMergePair(board: Board): boolean {
  const seen = new Set<string>();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = board[row][col];
      if (!cell) continue;
      const key = `${cell.chain}:${cell.tier}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
}

/** A pair of identical items that can be merged (powers idle hints). */
export function findMergeHint(board: Board): [Position, Position] | null {
  const byKey = new Map<string, Position>();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = board[row][col];
      if (!cell) continue;
      const key = `${cell.chain}:${cell.tier}`;
      const prev = byKey.get(key);
      if (prev) return [prev, { row, col }];
      byKey.set(key, { row, col });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Movement / merging
// ---------------------------------------------------------------------------

export interface MergeResult {
  board: Board;
  kind: 'none' | 'move' | 'merge';
  /** Positions where new (tier+1) items appeared. */
  spawned: Position[];
  /** Number of source items consumed. */
  consumed: number;
}

/** Flood-fill connected component of identical items (4-dir) containing `start`. */
function connectedComponent(board: Board, start: Position): Position[] {
  const seed = board[start.row][start.col];
  if (!seed) return [];
  const out: Position[] = [];
  const visited = new Set<string>();
  const stack: Position[] = [start];
  while (stack.length) {
    const p = stack.pop()!;
    const key = `${p.row},${p.col}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const cell = board[p.row][p.col];
    if (!sameItem(cell, seed)) continue;
    out.push(p);
    const neighbors: Position[] = [
      { row: p.row - 1, col: p.col },
      { row: p.row + 1, col: p.col },
      { row: p.row, col: p.col - 1 },
      { row: p.row, col: p.col + 1 },
    ];
    for (const n of neighbors) {
      if (inBounds(n) && !visited.has(`${n.row},${n.col}`)) stack.push(n);
    }
  }
  return out;
}

/**
 * Drag item at `from` onto cell `to`.
 * - empty target  -> move
 * - identical item -> merge (merge-5 bonus when >=5 involved)
 * - otherwise     -> no-op
 */
export function mergeAt(board: Board, from: Position, to: Position): MergeResult {
  if (!inBounds(from) || !inBounds(to)) {
    return { board, kind: 'none', spawned: [], consumed: 0 };
  }
  if (from.row === to.row && from.col === to.col) {
    return { board, kind: 'none', spawned: [], consumed: 0 };
  }
  const itemFrom = board[from.row][from.col];
  const itemTo = board[to.row][to.col];
  if (!itemFrom) return { board, kind: 'none', spawned: [], consumed: 0 };

  const next = cloneBoard(board);

  // Move onto empty cell.
  if (!itemTo) {
    next[to.row][to.col] = itemFrom;
    next[from.row][from.col] = null;
    return { board: next, kind: 'move', spawned: [], consumed: 0 };
  }

  // Merge requires identical chain+tier and room to tier up.
  if (!sameItem(itemFrom, itemTo)) {
    return { board, kind: 'none', spawned: [], consumed: 0 };
  }
  if (itemFrom.tier >= CHAIN_TIER_COUNT) {
    return { board, kind: 'none', spawned: [], consumed: 0 };
  }

  // Connected cluster around the target (the pile being merged into).
  const component = connectedComponent(board, to);
  const fromInComponent = component.some((p) => p.row === from.row && p.col === from.col);
  const totalConsumed = component.length + (fromInComponent ? 0 : 1);

  const consumedPositions: Position[] = [...component];
  if (!fromInComponent) consumedPositions.push(from);

  // Clear consumed cells.
  for (const p of consumedPositions) next[p.row][p.col] = null;

  const newTier = itemFrom.tier + 1;
  const spawned: Position[] = [];

  if (totalConsumed >= 5) {
    // Merge-5 bonus: 2 next-tier items.
    const slots = consumedPositions.slice(0, 2);
    for (const p of slots) {
      next[p.row][p.col] = makeItem(itemFrom.chain, newTier);
      spawned.push(p);
    }
  } else {
    next[to.row][to.col] = makeItem(itemFrom.chain, newTier);
    spawned.push({ row: to.row, col: to.col });
  }

  return { board: next, kind: 'merge', spawned, consumed: totalConsumed };
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

export interface SpawnResult {
  board: Board;
  pos: Position | null;
}

/** Spawn a tier-1 item of `chain` into an empty cell (given or random). */
export function spawnItem(
  board: Board,
  chain: ChainId,
  tier: number = 1,
  pos?: Position,
): SpawnResult {
  const next = cloneBoard(board);
  if (pos && inBounds(pos) && next[pos.row][pos.col] === null) {
    next[pos.row][pos.col] = makeItem(chain, tier);
    return { board: next, pos };
  }
  const empties = emptyCells(board);
  if (empties.length === 0) return { board, pos: null };
  const pick = empties[Math.floor(Math.random() * empties.length)];
  next[pick.row][pick.col] = makeItem(chain, tier);
  return { board: next, pos: pick };
}

// ---------------------------------------------------------------------------
// Generation (empty board; merge games have no dead-board guarantee needed,
// but we keep a helper for tests / fresh plots).
// ---------------------------------------------------------------------------

export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    board.push(new Array<Cell>(GRID_SIZE).fill(null));
  }
  return board;
}

/** Deterministic-ish starter board for tests: fill with given items. */
export function boardFromRows(rows: (string | null)[][]): Board {
  // rows: array of rows, each cell either null or "chain:tier" e.g. "frog:1"
  const board: Board = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const v = rows[r]?.[c];
      if (!v) row.push(null);
      else {
        const [chain, tier] = v.split(':');
        row.push(makeItem(chain as ChainId, Number(tier)));
      }
    }
    board.push(row);
  }
  return board;
}

// Re-export chain list for convenience.
export { CHAINS };