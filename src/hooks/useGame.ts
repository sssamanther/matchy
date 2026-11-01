import { useCallback, useEffect, useRef, useReducer, useState } from 'react';
import {
  createInitialState,
  gameReducer,
  toPersisted,
} from '../game/state';
import { findMergeHint } from '../game/board';
import { PLOTS } from '../game/plots';
import { RESTORATION_TASKS, isTaskAvailable } from '../game/restoration';
import { GARDEN_FEATURES } from '../game/garden';
import { ENERGY_CONFIG } from '../game/energyConfig';
import { loadGame, saveGame, clearSave } from '../storage';
import type { Position } from '../game/types';

export function useGame() {
  const initial = createInitialState(loadGame());
  const [state, dispatch] = useReducer(gameReducer, initial);
  const [unlimited, setUnlimited] = useState(false);
  const [energyToast, setEnergyToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  // persist on changes (skip first render to avoid overwriting with defaults)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveGame(toPersisted(state));
  }, [state]);

  // energy regeneration tick
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'REGENERATE', now: Date.now() }), 10000);
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

  const tapGenerator = useCallback((pos: Position) => {
    if (!unlimited && state.energy < ENERGY_CONFIG.generatorCost) {
      setEnergyToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setEnergyToast(false), 2500);
      return;
    }
    dispatch({ type: 'TAP_GENERATOR', pos, unlimited });
    bump();
  }, [bump, unlimited, state.energy]);

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

  const restoreTask = useCallback((taskId: string) => {
    dispatch({ type: 'RESTORE_TASK', taskId });
    bump();
  }, [bump]);

  const resetGame = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm('Reset all progress and start fresh?')) return;
    clearSave();
    dispatch({ type: 'RESET' });
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
    starBalance: state.starBalance,
    xp: state.xp,
    level: state.level,
    completedRestoration: state.completedRestoration,
    gardenUnlocks: state.gardenUnlocks,
    gardenFeatures: GARDEN_FEATURES,
    restorationTasks: RESTORATION_TASKS,
    isTaskAvailable,
    restoreTask,
    energy: state.energy,
    maxEnergy: ENERGY_CONFIG.maxEnergy,
    energyUpdatedAt: state.energyUpdatedAt,
    unlimited,
    setUnlimited,
    energyToast,
    nudge: state.nudge,
    hint: state.hint,
    sparkle: state.sparkle,
    unlockedPlots: state.unlockedPlots,
    handleDrop,
    tapSource,
    tapGenerator,
    serveOrder,
    nextPlot,
    selectPlot,
    resetGame,
  };
}