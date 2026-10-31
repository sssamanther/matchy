import {
  createEmptyBoard,
  createItem,
  createGenerator,
  mergeAt,
  spawnItem,
  generatorSpawnCell,
} from './board';
import { PLOTS } from './plots';
import { generateOrder } from './orders';
import { initialProgress, type Progress } from './progress';
import { CHAIN_TIER_COUNT } from './types';
import type { ChainId } from './types';
import type { Board, Order, Position, Plot } from './types';

export const SAVE_VERSION = 1;

export interface PersistedGameState {
  version: number;
  plotIndex: number;
  board: Board;
  orders: Order[];
  progress: Progress;
  unlockedPlots: number[];
}

export interface GameState extends PersistedGameState {
  hint: { a: Position; b: Position } | null;
  sparkle: Position | null;
  nudge: boolean;
}

export type GameAction =
  | { type: 'TAP_SOURCE'; index: number }
  | { type: 'TAP_GENERATOR'; pos: Position }
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

function initOrders(plot: Plot): Order[] {
  const chains = plot.sources.map((s) => s.chain);
  const out: Order[] = [];
  for (let i = 0; i < 3; i++) {
    const chain = chains.length ? chains[Math.floor(Math.random() * chains.length)] : 'frog';
    out.push(generateOrder(chain, 1, 1));
  }
  return out;
}

export function createInitialState(saved?: PersistedGameState | null): GameState {
  if (saved) {
    return {
      version: SAVE_VERSION,
      plotIndex: saved.plotIndex,
      board: saved.board,
      orders: saved.orders,
      progress: saved.progress,
      unlockedPlots: saved.unlockedPlots ?? [1],
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
    orders: initOrders(plot),
    progress: initialProgress(),
    unlockedPlots: [1],
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

      const newOrder = generateOrder(
        (PLOTS[state.plotIndex]?.sources[0]?.chain) ?? 'frog',
        1,
        1,
      );

      const newProgress: Progress = {
        ...state.progress,
        stars: state.progress.stars + 1,
        plotStars: state.progress.plotStars + 1,
      };

      return {
        ...state,
        board: nextBoard,
        orders: state.orders.map((o) => (o.id === action.orderId ? newOrder : o)),
        progress: newProgress,
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
        orders: initOrders(next),
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
        orders: initOrders(p),
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
      const nextBoard = state.board.map((row) => row.slice());
      nextBoard[spawnPos.row][spawnPos.col] = createItem(gen.chain, 1);
      return { ...state, board: nextBoard, nudge: false };
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

    default:
      return state;
  }
}

// re-export for convenience
export { CHAIN_TIER_COUNT };