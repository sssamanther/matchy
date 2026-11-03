import {
  createEmptyBoard,
  createItem,
  createGenerator,
  mergeAt,
  spawnItem,
  generatorSpawnCell,
} from './board';
import { PLOTS } from './plots';
import { RESTORATION_TASKS, isTaskAvailable } from './restoration';
import { computeUnlockedFeatures } from './garden';
import { generateOrder, generateOrderSet, rewardFor, migrateOrders, reconcileOrders, canFulfill } from './orders';
import { initialProgress, levelFromXp, type Progress } from './progress';
import { regenerateEnergy, refillEnergy } from './energy';
import { ENERGY_CONFIG } from './energyConfig';
import {
  STORAGE_BASE_CAPACITY,
  createStorage,
  firstFreeSlot,
  isStorable,
  normalizeCapacity,
  normalizeStorage,
  type StorageSlots,
} from './inventory';
import { CHAIN_TIER_COUNT, isItem } from './types';
import type { Board, Cell, ChainId, Item, Order, Position, Plot } from './types';

export const SAVE_VERSION = 1;

export interface PersistedGameState {
  version: number;
  plotIndex: number;
  board: Board;
  orders: Order[];
  progress: Progress;
  unlockedPlots: number[];
  energy?: number;
  energyUpdatedAt?: number;
  starBalance?: number;
  xp?: number;
  level?: number;
  completedRestoration?: string[];
  unlockedChains?: ChainId[];
  pendingGenerators?: ChainId[];
  gardenUnlocks?: string[];
  selectedGoalId?: string | null;
  /** Storage inventory slots (optional — legacy saves hydrate to empty storage). */
  storageSlots?: (Item | null)[];
  /** Storage capacity; fixed at 8 for now (upgrades arrive as a separate feature). */
  storageCapacity?: number;
}

export interface GameState extends PersistedGameState {
  hint: { a: Position; b: Position } | null;
  sparkle: Position | null;
  nudge: boolean;
  /**
   * Transient UI selection of a board item: the cell plus the item's stable
   * id, so any action that moves/merges/stores/removes the item can detect
   * it centrally. Never persisted (like hint/sparkle/nudge).
   */
  selected: { pos: Position; id: number } | null;
  storageSlots: StorageSlots;
  storageCapacity: number;
  energy: number;
  energyUpdatedAt: number;
  starBalance: number;
  xp: number;
  level: number;
  completedRestoration: string[];
  unlockedChains: ChainId[];
  pendingGenerators: ChainId[];
  gardenUnlocks: string[];
  selectedGoalId: string | null;
}

export type GameAction =
  | { type: 'TAP_SOURCE'; index: number }
  | { type: 'TAP_GENERATOR'; pos: Position; unlimited?: boolean }
  | { type: 'REGENERATE'; now: number }
  // DEV-ONLY (temporary): debug "Refill Energy" button — see src/dev/devTools.ts
  | { type: 'DEV_REFILL_ENERGY'; now: number }
  | { type: 'RESET' }
  | { type: 'RESTORE_TASK'; taskId: string }
  | { type: 'SELECT_GOAL'; goalId: string | null }
  | { type: 'DROP'; from: Position; to: Position }
  | { type: 'SELECT_CELL'; pos: Position }
  | { type: 'STORE_ITEM'; pos: Position }
  | { type: 'RETRIEVE_ITEM'; index: number }
  | { type: 'SERVE_ORDER'; orderId: number }
  | { type: 'NEXT_PLOT' }
  | { type: 'SELECT_PLOT'; index: number }
  | { type: 'RAIN_DROP' }
  | { type: 'SET_HINT'; hint: { a: Position; b: Position } | null }
  | { type: 'SET_NUDGE'; value: boolean }
  | { type: 'SET_SPARKLE'; value: Position | null }
  | { type: 'HYDRATE'; state: GameState };

const UNLOCK_SCHEDULE: Record<number, ChainId[]> = {
  3: ['plant', 'mushroom'],
  4: ['berry'],
  5: ['tool'],
  7: ['woodland'],
};

function findEmptyCell(board: Board): Position | null {
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    if (board[r][c] === null) return { row: r, col: c };
  }
  return null;
}

/**
 * Grant every unlock between `prevLevel` (exclusive) and `newLevel`
 * (inclusive). Pass the level *before* the gain — callers must not set
 * `state.level` to `newLevel` beforehand or the loop never runs.
 * Generators are placed on the first free cell; when the board is full the
 * chain is queued in `pendingGenerators` for later delivery.
 */
function applyUnlocks(state: GameState, prevLevel: number, newLevel: number): GameState {
  let s = { ...state, level: newLevel, unlockedChains: [...state.unlockedChains], pendingGenerators: [...state.pendingGenerators] };
  for (let lvl = Math.max(0, prevLevel) + 1; lvl <= newLevel; lvl++) {
    const chains = UNLOCK_SCHEDULE[lvl] ?? [];
    for (const ch of chains) {
      if (s.unlockedChains.includes(ch)) continue;
      s.unlockedChains.push(ch);
      const cell = findEmptyCell(s.board);
      if (cell) {
        const b = s.board.map((row) => row.slice());
        b[cell.row][cell.col] = createGenerator(ch);
        s = { ...s, board: b };
      } else if (!s.pendingGenerators.includes(ch)) {
        s.pendingGenerators.push(ch);
      }
    }
  }
  return s;
}

/**
 * Deliver queued generator unlocks into free cells without ever
 * overwriting existing cells. Chains that still have no room stay queued
 * (exactly once), so a pending unlock is never lost or granted twice.
 */
function flushPendingGenerators(state: GameState): GameState {
  if (state.pendingGenerators.length === 0) return state;
  const remaining: ChainId[] = [];
  let board = state.board;
  let delivered = 0;
  for (const ch of state.pendingGenerators) {
    if (remaining.includes(ch)) continue; // drop accidental duplicates
    const cell = findEmptyCell(board);
    if (cell) {
      const b = board.map((row) => row.slice());
      b[cell.row][cell.col] = createGenerator(ch);
      board = b;
      delivered++;
    } else {
      remaining.push(ch);
    }
  }
  if (delivered === 0 && remaining.length === state.pendingGenerators.length) return state;
  return { ...state, board, pendingGenerators: remaining };
}

function initBoard(plot: Plot): Board {
  const b = createEmptyBoard();
  // generators occupy cells from sources
  for (const s of plot.sources) {
    b[s.pos.row][s.pos.col] = createGenerator(s.chain);
  }
  if (plot.startingItems) {
    for (const si of plot.startingItems) {
      if (b[si.pos.row][si.pos.col] === null) {
        b[si.pos.row][si.pos.col] = createItem(si.chain, si.tier);
      }
    }
  }
  return b;
}

function initOrders(chains: ChainId[], plotIndex: number, completedOrders: number, level: number): Order[] {
  return generateOrderSet(chains, plotIndex, completedOrders, level);
}

export function createInitialState(saved?: PersistedGameState | null, now: number = Date.now()): GameState {
  if (saved) {
    // Reconcile against the XP-derived level: a save written by an older
    // build may carry a stale/absent level field.
    const xpLevel = levelFromXp(saved.xp ?? 0);
    const level = Math.max(saved.level && saved.level > 0 ? saved.level : 0, xpLevel);
    // Optional storage fields: legacy saves simply hydrate to empty storage.
    const storageCapacity = normalizeCapacity(saved.storageCapacity);
    const base: GameState = {
      version: SAVE_VERSION,
      plotIndex: saved.plotIndex,
      board: saved.board,
      orders: migrateOrders(saved.orders),
      progress: { ...saved.progress, completedOrders: saved.progress.completedOrders ?? 0 },
      unlockedPlots: saved.unlockedPlots ?? [1],
      ...regenerateEnergy(
        saved.energy ?? ENERGY_CONFIG.startingEnergy,
        saved.energyUpdatedAt ?? now,
        now,
      ),
      starBalance: saved.starBalance ?? saved.progress?.stars ?? 0,
      xp: saved.xp ?? 0,
      level: 0,
      completedRestoration: saved.completedRestoration ?? [],
      unlockedChains: saved.unlockedChains ?? (['frog', 'flower'] as ChainId[]),
      pendingGenerators: saved.pendingGenerators ?? [],
      gardenUnlocks: computeUnlockedFeatures((saved.completedRestoration ?? []).length, saved.gardenUnlocks ?? []),
      selectedGoalId: saved.selectedGoalId ?? null,
      storageCapacity,
      storageSlots: normalizeStorage(saved.storageSlots, storageCapacity),
      selected: null,
      hint: null,
      sparkle: null,
      nudge: false,
    };
    const hydrated = flushPendingGenerators(applyUnlocks(base, 0, level));
    // Heal duplicate requirement sets inherited from pre-fix saves (e.g. the
    // three identical Froglet Tier 3 orders) — non-destructive: ids, progress
    // and every unique order survive untouched.
    return {
      ...hydrated,
      orders: reconcileOrders(hydrated.orders, {
        chains: hydrated.unlockedChains,
        completedOrders: hydrated.progress.completedOrders,
        plotIndex: hydrated.plotIndex,
        existingOrders: hydrated.orders,
        board: hydrated.board,
        level: hydrated.level,
      }),
    };
  }
  const plot = PLOTS[0];
  return {
    version: SAVE_VERSION,
    plotIndex: 0,
    board: initBoard(plot),
    orders: initOrders(['flower', 'frog'], 0, 0, levelFromXp(0)),
    progress: initialProgress(),
    unlockedPlots: [1],
    energy: ENERGY_CONFIG.startingEnergy,
    energyUpdatedAt: now,
    starBalance: 0,
    xp: 0,
    level: levelFromXp(0),
    completedRestoration: [],
    unlockedChains: (['flower', 'frog'] as ChainId[]),
    pendingGenerators: [],
    gardenUnlocks: [],
    selectedGoalId: null,
    storageCapacity: STORAGE_BASE_CAPACITY,
    storageSlots: createStorage(STORAGE_BASE_CAPACITY),
    selected: null,
    hint: null,
    sparkle: null,
    nudge: false,
  };
}

function toPersisted(s: GameState): PersistedGameState {
  return {
    version: s.version,
    plotIndex: s.plotIndex,
    board: s.board,
    orders: s.orders,
    progress: s.progress,
    unlockedPlots: s.unlockedPlots,
    energy: s.energy,
    energyUpdatedAt: s.energyUpdatedAt,
    starBalance: s.starBalance,
    xp: s.xp,
    level: s.level,
    completedRestoration: s.completedRestoration,
    unlockedChains: s.unlockedChains,
    pendingGenerators: s.pendingGenerators,
    gardenUnlocks: s.gardenUnlocks,
    selectedGoalId: s.selectedGoalId,
    storageSlots: s.storageSlots,
    storageCapacity: s.storageCapacity,
  };
}

export { toPersisted };

function reduceAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;

    case 'TAP_SOURCE': {
      const plot = PLOTS[state.plotIndex];
      const source = plot?.sources[action.index];
      if (!source) return state;
      const res = spawnItem(state.board, source.chain, 1);
      if (!res.pos) {
        return { ...state, nudge: true };
      }
      return { ...state, board: res.board, nudge: false };
    }

    case 'DROP': {
      const res = mergeAt(state.board, action.from, action.to);
      if (res.kind === 'none') return state;
      const next: GameState = { ...state, board: res.board };
      if (res.kind === 'merge' && res.spawned.length) {
        next.sparkle = res.spawned[0];
      }
      // A move/merge frees a cell — deliver any pending generator unlock.
      return flushPendingGenerators(next);
    }

    case 'SELECT_CELL': {
      const cell: Cell | null = state.board[action.pos.row]?.[action.pos.col] ?? null;
      // Only regular items are selectable. Empty tiles — and anything that is
      // not a storable item — clear the current selection instead.
      if (!isStorable(cell)) {
        return state.selected === null ? state : { ...state, selected: null };
      }
      const sel = state.selected;
      if (
        sel &&
        sel.pos.row === action.pos.row &&
        sel.pos.col === action.pos.col &&
        sel.id === cell.id
      ) {
        return state; // re-tapping the already-selected item is a no-op
      }
      return { ...state, selected: { pos: { row: action.pos.row, col: action.pos.col }, id: cell.id } };
    }

    case 'STORE_ITEM': {
      const cell: Cell | null = state.board[action.pos.row]?.[action.pos.col] ?? null;
      // Regular items only: generators, sources and empty cells are refused
      // with the board left completely untouched.
      if (!isStorable(cell)) return state;
      const index = firstFreeSlot(state.storageSlots);
      // Storage full: refuse the action — the item stays safely on the board.
      if (index === -1) return state;
      const slots = state.storageSlots.slice();
      slots[index] = cell; // same object: chain/tier/id all preserved
      const board = state.board.map((row) => row.slice());
      board[action.pos.row][action.pos.col] = null;
      // The item left the board, so the selection wrapper clears `selected`.
      return { ...state, board, storageSlots: slots };
    }

    case 'RETRIEVE_ITEM': {
      const slot = state.storageSlots[action.index] ?? null;
      if (!slot) return state; // empty or out-of-range slot: no-op
      // Deterministic placement: first free tile in row-major order.
      const dest = findEmptyCell(state.board);
      // Board full: refuse the action — the item stays safely in storage.
      if (!dest) return state;
      const board = state.board.map((row) => row.slice());
      board[dest.row][dest.col] = slot; // same object: identity preserved
      const slots = state.storageSlots.slice();
      slots[action.index] = null;
      return { ...state, board, storageSlots: slots };
    }

    case 'SERVE_ORDER': {
      // Replace exactly one order slot: with legacy saves that contain
      // duplicate ids, an id-based map() replaced every matching order
      // with the same new order object (duplicated orders on screen).
      const orderIndex = state.orders.findIndex((o) => o.id === action.orderId);
      if (orderIndex === -1) return state;
      const order = state.orders[orderIndex];
      // fulfillability
      if (!canFulfill(state.board, order)) return state;

      // aggregate required counts
      const reqMap = new Map<string, number>();
      for (const r of order.requirements) {
        const key = `${r.chain}:${r.tier}`;
        reqMap.set(key, (reqMap.get(key) ?? 0) + r.count);
      }
      const nextBoard = state.board.map((row) => row.slice());
      for (const [key, needed] of reqMap) {
        const [chain, tierStr] = key.split(':');
        const tier = Number(tierStr);
        let removed = 0;
        outer: for (let r = 0; r < nextBoard.length; r++) {
          for (let c = 0; c < nextBoard[r].length; c++) {
            const cell = nextBoard[r][c];
            if (cell && 'tier' in cell && cell.chain === chain && cell.tier === tier) {
              nextBoard[r][c] = null;
              removed++;
              if (removed >= needed) break outer;
            }
          }
        }
      }

      const reward = rewardFor(order);
      const newCompleted = state.progress.completedOrders + 1;
      const chains = state.unlockedChains;
      const newLevel = levelFromXp(state.xp + reward);
      const newOrder = generateOrder({
        chains,
        completedOrders: newCompleted,
        plotIndex: state.plotIndex,
        existingOrders: state.orders.filter((_, i) => i !== orderIndex),
        board: nextBoard,
        level: newLevel,
      });

      const newProgress: Progress = {
        ...state.progress,
        stars: state.progress.stars + reward,
        plotStars: state.progress.plotStars + reward,
        completedOrders: newCompleted,
      };

      const base = {
        ...state,
        board: nextBoard,
        orders: state.orders.map((o, i) => (i === orderIndex ? newOrder : o)),
        progress: newProgress,
        starBalance: state.starBalance + reward,
        xp: state.xp + reward,
        level: newLevel,
      };
      if (newLevel > state.level) {
        return flushPendingGenerators(applyUnlocks(base, state.level, newLevel));
      }
      return flushPendingGenerators(base);
    }

    case 'NEXT_PLOT': {
      if (state.plotIndex + 1 >= PLOTS.length) return state;
      const next = PLOTS[state.plotIndex + 1];
      const unlocked = state.unlockedPlots.includes(next.id)
        ? state.unlockedPlots
        : [...state.unlockedPlots, next.id];
      return {
        ...state,
        plotIndex: state.plotIndex + 1,
        board: initBoard(next),
        orders: initOrders(state.unlockedChains, state.plotIndex + 1, state.progress.completedOrders, state.level),
        unlockedPlots: unlocked,
        progress: { ...state.progress, currentPlot: next.id, plotStars: 0 },
        hint: null,
        sparkle: null,
        nudge: false,
        selected: null,
      };
    }

    case 'SELECT_PLOT': {
      const p = PLOTS[action.index];
      if (!p) return state;
      if (!state.unlockedPlots.includes(p.id)) return state;
      return {
        ...state,
        plotIndex: action.index,
        board: initBoard(p),
        orders: initOrders(state.unlockedChains, action.index, state.progress.completedOrders, state.level),
        progress: { ...state.progress, currentPlot: p.id, plotStars: 0 },
        hint: null,
        sparkle: null,
        nudge: false,
        selected: null,
      };
    }

    case 'TAP_GENERATOR': {
      const cell = state.board[action.pos.row]?.[action.pos.col];
      if (!cell || !('kind' in cell) || (cell as { kind: string }).kind !== 'generator') return state;
      const gen = cell as { kind: 'generator'; chain: ChainId };
      const spawnPos = generatorSpawnCell(state.board, action.pos);
      if (!spawnPos) {
        return { ...state, nudge: true };
      }
      // energy check
      const unlimited = action.unlimited === true;
      if (!unlimited && state.energy < ENERGY_CONFIG.generatorCost) {
        return { ...state, nudge: true };
      }
      const nextBoard = state.board.map((row) => row.slice());
      nextBoard[spawnPos.row][spawnPos.col] = createItem(gen.chain, 1);
      const newEnergy = unlimited ? state.energy : state.energy - ENERGY_CONFIG.generatorCost;
      return { ...state, board: nextBoard, nudge: false, energy: newEnergy };
    }

    case 'RAIN_DROP': {
      const plot = PLOTS[state.plotIndex];
      const source = plot?.sources[0];
      if (!source) return state;
      const res = spawnItem(state.board, source.chain, 1);
      if (!res.pos) return state;
      return { ...state, board: res.board };
    }

    case 'SELECT_GOAL':
      return { ...state, selectedGoalId: action.goalId };

    case 'SET_HINT':
      return { ...state, hint: action.hint };

    case 'SET_NUDGE':
      return { ...state, nudge: action.value };

    case 'SET_SPARKLE':
      return { ...state, sparkle: action.value };

    case 'RESTORE_TASK': {
      const task = RESTORATION_TASKS.find((t) => t.id === action.taskId);
      if (!task) return state;
      if (state.completedRestoration.includes(task.id)) return state;
      if (!isTaskAvailable(task, state.completedRestoration)) return state;
      if (state.starBalance < task.cost) return state;
      const newCompleted = [...state.completedRestoration, task.id];
      const newLevel = levelFromXp(state.xp + task.cost);
      const base = {
        ...state,
        starBalance: state.starBalance - task.cost,
        completedRestoration: newCompleted,
        gardenUnlocks: computeUnlockedFeatures(newCompleted.length, state.gardenUnlocks),
        xp: state.xp + task.cost,
        level: newLevel,
        selectedGoalId: state.selectedGoalId === task.id ? null : state.selectedGoalId,
      };
      if (newLevel > state.level) return flushPendingGenerators(applyUnlocks(base, state.level, newLevel));
      return base;
    }

    case 'RESET':
      return createInitialState(null, Date.now());

    case 'REGENERATE': {
      const r = regenerateEnergy(state.energy, state.energyUpdatedAt, action.now);
      return { ...state, energy: r.energy, energyUpdatedAt: r.energyUpdatedAt };
    }

    // DEV-ONLY (temporary): debug "Refill Energy" button. Updates only the
    // two energy fields with the same semantics as a natural fill, so stars,
    // XP, orders, board and garden progress are untouched and the regular
    // regeneration system keeps its normal timing.
    case 'DEV_REFILL_ENERGY': {
      const r = refillEnergy(action.now);
      return { ...state, energy: r.energy, energyUpdatedAt: r.energyUpdatedAt };
    }

    default:
      return state;
  }
}

/**
 * Selection tracks one *specific* item at one board cell. Whenever an action
 * leaves that cell empty or holding a different id — the item was moved,
 * merged, stored, served or otherwise removed — the selection is cleared.
 * Applying this centrally means no individual action can forget to, and it
 * can never point at the wrong item.
 */
function reconcileSelection(state: GameState): GameState {
  const sel = state.selected;
  if (!sel) return state;
  const cell: Cell | null = state.board[sel.pos.row]?.[sel.pos.col] ?? null;
  if (cell !== null && isItem(cell) && cell.id === sel.id) return state;
  return { ...state, selected: null };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  return reconcileSelection(reduceAction(state, action));
}

// re-export for convenience
export { CHAIN_TIER_COUNT };