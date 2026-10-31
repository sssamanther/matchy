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

export function initialProgress(): Progress {
  return { currentPlot: 1, stars: 0, plotStars: 0, completedOrders: 0 };
}