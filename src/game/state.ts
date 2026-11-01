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
import { generateOrder, generateOrderSet, rewardFor, migrateOrders } from './orders';
import { initialProgress, type Progress } from './progress';
import { regenerateEnergy } from './energy';
import { ENERGY_CONFIG } from './energyConfig';
import { CHAIN_TIER_COUNT } from './types';
import type { Board, ChainId, Order, Position, Plot } from './types';

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
  gardenUnlocks?: string[];
}

export interface GameState extends PersistedGameState {
  hint: { a: Position; b: Position } | null;
  sparkle: Position | null;
  nudge: boolean;
  energy: number;
  energyUpdatedAt: number;
  starBalance: number;
  xp: number;
  level: number;
  completedRestoration: string[];
  unlockedChains: ChainId[];
  gardenUnlocks: string[];
}

export type GameAction =
  | { type: 'TAP_SOURCE'; index: number }
  | { type: 'TAP_GENERATOR'; pos: Position; unlimited?: boolean }
  | { type: 'REGENERATE'; now: number }
  | { type: 'RESET' }
  | { type: 'RESTORE_TASK'; taskId: string }
  | { type: 'DROP'; from: Position; to: Position }
  | { type: 'SERVE_ORDER'; orderId: number }
  | { type: 'NEXT_PLOT' }
  | { type: 'SELECT_PLOT'; index: number }
  | { type: 'RAIN_DROP' }
  | { type: 'SET_HINT'; hint: { a: Position; b: Position } | null }
  | { type: 'SET_NUDGE'; value: boolean }
  | { type: 'SET_SPARKLE'; value: Position | null }
  | { type: 'HYDRATE'; state: GameState };

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

function initOrders(plot: Plot, plotIndex: number, completedOrders: number): Order[] {
  const chains = plot.sources.map((s) => s.chain);
  return generateOrderSet(chains, plotIndex, completedOrders);
}

export function createInitialState(saved?: PersistedGameState | null, now: number = Date.now()): GameState {
  if (saved) {
    return {
      version: SAVE_VERSION,
      plotIndex: saved.plotIndex,
      board: saved.board,
      orders: migrateOrders(
      saved.orders,
      saved.plotIndex,
      (PLOTS[saved.plotIndex] ?? PLOTS[0]).sources.map((s) => s.chain),
    ),
      progress: { ...saved.progress, completedOrders: saved.progress.completedOrders ?? 0 },
      unlockedPlots: saved.unlockedPlots ?? [1],
    ...regenerateEnergy(
      saved.energy ?? ENERGY_CONFIG.startingEnergy,
      saved.energyUpdatedAt ?? now,
      now,
    ),
    starBalance: saved.starBalance ?? saved.progress?.stars ?? 0,
    xp: saved.xp ?? 0,
    level: saved.level ?? 0,
    completedRestoration: saved.completedRestoration ?? [],
    unlockedChains: saved.unlockedChains ?? (['frog', 'flower', 'mushroom', 'berry'] as ChainId[]),
    gardenUnlocks: computeUnlockedFeatures((saved.completedRestoration ?? []).length, saved.gardenUnlocks ?? []),
    hint: null,
    sparkle: null,
    nudge: false,
    };
  }
  const plot = PLOTS[0];
  return {
    version: SAVE_VERSION,
    plotIndex: 0,
    board: initBoard(plot),
    orders: initOrders(plot, 0, 0),
    progress: initialProgress(),
    unlockedPlots: [1],
    energy: ENERGY_CONFIG.startingEnergy,
    energyUpdatedAt: now,
    starBalance: 0,
    xp: 0,
    level: 0,
    completedRestoration: [],
    unlockedChains: (['frog', 'flower', 'mushroom', 'berry'] as ChainId[]),
    gardenUnlocks: [],
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
    gardenUnlocks: s.gardenUnlocks,
  };
}

export { toPersisted };

export function gameReducer(state: GameState, action: GameAction): GameState {
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
      return next;
    }

    case 'SERVE_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      // fulfillability
      let count = 0;
      for (const row of state.board) for (const cell of row) {
        if (cell && 'tier' in cell && cell.chain === order.chain && cell.tier === order.tier) count++;
      }
      if (count < order.count) return state;

      // remove items
      const nextBoard = state.board.map((row) => row.slice());
      let removed = 0;
      outer: for (let r = 0; r < nextBoard.length; r++) {
        for (let c = 0; c < nextBoard[r].length; c++) {
          const cell = nextBoard[r][c];
          if (cell && 'tier' in cell && cell.chain === order.chain && cell.tier === order.tier) {
            nextBoard[r][c] = null;
            removed++;
            if (removed >= order.count) break outer;
          }
        }
      }

      const reward = rewardFor(order);
      const newCompleted = state.progress.completedOrders + 1;
      const chains = (PLOTS[state.plotIndex]?.sources ?? []).map((s) => s.chain);
      const newOrder = generateOrder({
        chains,
        completedOrders: newCompleted,
        plotIndex: state.plotIndex,
        existingOrders: state.orders.filter((o) => o.id !== action.orderId),
        board: nextBoard,
      });

      const newProgress: Progress = {
        ...state.progress,
        stars: state.progress.stars + reward,
        plotStars: state.progress.plotStars + reward,
        completedOrders: newCompleted,
      };

      return {
        ...state,
        board: nextBoard,
        orders: state.orders.map((o) => (o.id === action.orderId ? newOrder : o)),
        progress: newProgress,
        starBalance: state.starBalance + reward,
        xp: state.xp + reward,
      };
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
        orders: initOrders(next, state.plotIndex + 1, state.progress.completedOrders),
        unlockedPlots: unlocked,
        progress: { ...state.progress, currentPlot: next.id, plotStars: 0 },
        hint: null,
        sparkle: null,
        nudge: false,
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
        orders: initOrders(p, action.index, state.progress.completedOrders),
        progress: { ...state.progress, currentPlot: p.id, plotStars: 0 },
        hint: null,
        sparkle: null,
        nudge: false,
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
      return {
        ...state,
        starBalance: state.starBalance - task.cost,
        completedRestoration: newCompleted,
        gardenUnlocks: computeUnlockedFeatures(newCompleted.length, state.gardenUnlocks),
        xp: state.xp + task.cost,
      };
    }

    case 'RESET':
      return createInitialState(null, Date.now());

    case 'REGENERATE': {
      const r = regenerateEnergy(state.energy, state.energyUpdatedAt, action.now);
      return { ...state, energy: r.energy, energyUpdatedAt: r.energyUpdatedAt };
    }

    default:
      return state;
  }
}

// re-export for convenience
export { CHAIN_TIER_COUNT };