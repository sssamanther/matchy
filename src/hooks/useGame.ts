import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEmptyBoard,
  createItem,
  spawnItem,
  mergeAt,
  findMergeHint,
  type MergeResult,
} from '../game/board';
import { PLOTS } from '../game/plots';
import { generateOrder, canFulfill } from '../game/orders';
import { initialProgress } from '../game/progress';
import { loadProgress, saveProgress } from '../storage';
import type { Plot, Progress, Board, Order, Position, Source, ChainId } from '../game/types';

export function useGame() {
  const [plotIndex, setPlotIndex] = useState(0);
  const plot = PLOTS[plotIndex];
  const [board, setBoard] = useState<Board>(() => initBoard(plot));
  const [orders, setOrders] = useState<Order[]>(() => initOrders(plot));
  const [progress, setProgress] = useState<Progress>(() => loadProgress() ?? initialProgress());
  const [starsThisPlot, setStarsThisPlot] = useState(0);
  const [nudge, setNudge] = useState(false);
  const [hint, setHint] = useState<{ a: Position; b: Position } | null>(null);
  const dragFrom = useRef<Position | null>(null);
  const lastAction = useRef(Date.now());

  // rain ambient drop every 10s
  useEffect(() => {
    const id = setInterval(() => {
      setBoard((b) => {
        const source = plot.sources[0];
        if (!source) return b;
        const res = spawnItem(b, source.chain, 1);
        return res.pos ? res.board : b;
      });
    }, 10000);
    return () => clearInterval(id);
  }, [plot]);

  // persist progress
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  // idle hint after ~8s
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastAction.current >= 8000) {
        setBoard((b) => {
          const h = findMergeHint(b);
          if (h) setHint({ a: h[0], b: h[1] });
          return b;
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const nudgeBoard = useCallback(() => {
    setNudge(true);
    setTimeout(() => setNudge(false), 400);
  }, []);

  const bump = useCallback(() => {
    lastAction.current = Date.now();
    setHint(null);
  }, []);

  const handleDrop = useCallback((from: Position, to: Position) => {
    setBoard((b) => {
      const res: MergeResult = mergeAt(b, from, to);
      if (res.kind === 'none') return b;
      return res.board;
    });
    bump();
  }, [bump]);

  const tapSource = useCallback((sourceIdx: number) => {
    const source = plot.sources[sourceIdx];
    if (!source) return;
    setBoard((b) => {
      const res = spawnItem(b, source.chain, 1);
      if (!res.pos) { nudgeBoard(); return b; }
      return res.board;
    });
    bump();
  }, [plot, nudgeBoard, bump]);

  const serveOrder = useCallback((orderId: number) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === orderId);
      if (!order) return prev;
      // check fulfillability against current board
      let ok = false;
      setBoard((b) => {
        if (!canFulfill(b, order)) { ok = false; return b; }
        ok = true;
        // remove `count` items
        const next = b.map((row) => row.slice());
        let removed = 0;
        outer: for (let r = 0; r < next.length; r++) {
          for (let c = 0; c < next[r].length; c++) {
            const cell = next[r][c];
            if (cell && cell.chain === order.chain && cell.tier === order.tier) {
              next[r][c] = null;
              removed++;
              if (removed >= order.count) break outer;
            }
          }
        }
        return next;
      });
      if (!ok) return prev;
      // award star
      setStarsThisPlot((s) => s + 1);
      setProgress((p: Progress) => ({ ...p, stars: p.stars + 1, plotStars: p.plotStars + 1 }));
      // replace order
      const newOrder = generateOrder(
        plot.sources[Math.floor(Math.random() * plot.sources.length)]?.chain ?? 'frog',
        1,
        1,
      );
      return prev.map((o) => (o.id === orderId ? newOrder : o));
    });
    bump();
  }, [plot, bump]);

  const nextPlot = useCallback(() => {
    if (plotIndex + 1 >= PLOTS.length) return;
    const next = PLOTS[plotIndex + 1];
    setPlotIndex(plotIndex + 1);
    setBoard(initBoard(next));
    setOrders(initOrders(next));
    setStarsThisPlot(0);
  }, [plotIndex]);

  const selectPlot = useCallback((i: number) => {
    const p = PLOTS[i];
    if (!p) return;
    setPlotIndex(i);
    setBoard(initBoard(p));
    setOrders(initOrders(p));
    setStarsThisPlot(0);
    bump();
  }, [bump]);

  return {
    plot,
    plotIndex,
    board,
    orders,
    progress,
    starsThisPlot,
    nudge,
    hint,
    dragFrom,
    handleDrop,
    tapSource,
    serveOrder,
    nextPlot,
    selectPlot,
  };
}

function initBoard(plot: Plot): Board {
  const b = createEmptyBoard();
  if (plot.startingItems) {
    for (const si of plot.startingItems) {
      b[si.pos.row][si.pos.col] = createItem(si.chain, si.tier);
    }
  }
  return b;
}

function initOrders(plot: Plot): Order[] {
  const chains: ChainId[] = plot.sources.map((s: Source) => s.chain);
  const out: Order[] = [];
  for (let i = 0; i < 3; i++) {
    const chain = chains.length ? chains[Math.floor(Math.random() * chains.length)] : 'frog';
    out.push(generateOrder(chain, 1, 1));
  }
  return out;
}