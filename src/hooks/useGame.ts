import { useCallback, useEffect, useRef, useReducer } from 'react';
import {
  createInitialState,
  gameReducer,
  toPersisted,
} from '../game/state';
import { findMergeHint } from '../game/board';
import { PLOTS } from '../game/plots';
import { loadGame, saveGame } from '../storage';
import type { Position } from '../game/types';

export function useGame() {
  const initial = createInitialState(loadGame());
  const [state, dispatch] = useReducer(gameReducer, initial);
  const hydrated = useRef(false);

  // persist on changes (skip first render to avoid overwriting with defaults)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveGame(toPersisted(state));
  }, [state]);

  // rain ambient drop every 10s
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'RAIN_DROP' }), 10000);
    return () => clearInterval(id);
  }, []);

  // idle hint after ~8s
  const lastAction = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastAction.current >= 8000) {
        const h = findMergeHint(state.board);
        if (h) dispatch({ type: 'SET_HINT', hint: { a: h[0], b: h[1] } });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.board]);

  const bump = useCallback(() => {
    lastAction.current = Date.now();
    dispatch({ type: 'SET_HINT', hint: null });
  }, []);

  const tapSource = useCallback((index: number) => {
    dispatch({ type: 'TAP_SOURCE', index });
    bump();
  }, [bump]);

  const handleDrop = useCallback((from: Position, to: Position) => {
    dispatch({ type: 'DROP', from, to });
    bump();
  }, [bump]);

  const serveOrder = useCallback((orderId: number) => {
    dispatch({ type: 'SERVE_ORDER', orderId });
    bump();
  }, [bump]);

  const nextPlot = useCallback(() => {
    dispatch({ type: 'NEXT_PLOT' });
    bump();
  }, [bump]);

  const selectPlot = useCallback((index: number) => {
    dispatch({ type: 'SELECT_PLOT', index });
    bump();
  }, [bump]);

  // clear nudge after animation
  useEffect(() => {
    if (!state.nudge) return;
    const t = setTimeout(() => dispatch({ type: 'SET_NUDGE', value: false }), 400);
    return () => clearTimeout(t);
  }, [state.nudge]);

  // clear sparkle after animation
  useEffect(() => {
    if (!state.sparkle) return;
    const t = setTimeout(() => dispatch({ type: 'SET_SPARKLE', value: null }), 600);
    return () => clearTimeout(t);
  }, [state.sparkle]);

  return {
    plot: PLOTS[state.plotIndex],
    plotIndex: state.plotIndex,
    board: state.board,
    orders: state.orders,
    progress: state.progress,
    starsThisPlot: state.progress.plotStars,
    nudge: state.nudge,
    hint: state.hint,
    sparkle: state.sparkle,
    unlockedPlots: state.unlockedPlots,
    handleDrop,
    tapSource,
    serveOrder,
    nextPlot,
    selectPlot,
  };
}