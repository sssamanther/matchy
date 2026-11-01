import { PLOTS } from './plots';
import type { Progress } from './types';
export type { Progress };

export const GARDEN_LEVEL_THRESHOLDS = [0, 5, 15, 30, 50, 80];

export function isPlotComplete(plotStars: number, plotId: number): boolean {
  const plot = PLOTS.find((p) => p.id === plotId);
  return !!plot && plotStars >= plot.starQuota;
}

export function gardenLevel(stars: number): number {
  let level = 0;
  for (let i = 0; i < GARDEN_LEVEL_THRESHOLDS.length; i++) {
    if (stars >= GARDEN_LEVEL_THRESHOLDS[i]) level = i;
  }
  return level;
}

export const XP_THRESHOLDS: number[] = [0, 0, 50, 125, 225, 350, 500];

export function xpForNextLevel(xp: number): { current: number; needed: number; pct: number } {
  const level = levelFromXp(xp);
  const nextThreshold = XP_THRESHOLDS[level + 1] ?? (XP_THRESHOLDS[XP_THRESHOLDS.length - 1] + 200 * (level + 1 - (XP_THRESHOLDS.length - 1)));
  const prevThreshold = XP_THRESHOLDS[level] ?? 0;
  const current = xp - prevThreshold;
  const needed = nextThreshold - prevThreshold;
  const pct = needed > 0 ? (current / needed) * 100 : 100;
  return { current, needed, pct };
}

export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i;
  }
  // beyond table: +1 every 200 xp
  if (xp >= XP_THRESHOLDS[XP_THRESHOLDS.length - 1]) {
    const extra = Math.floor((xp - XP_THRESHOLDS[XP_THRESHOLDS.length - 1]) / 200);
    level += extra;
  }
  return level;
}

export function initialProgress(): Progress {
  return { currentPlot: 1, stars: 0, plotStars: 0, completedOrders: 0 };
}