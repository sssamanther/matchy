export type GardenFeatureState = 'locked' | 'available' | 'restored' | 'placed';

export interface GardenFeature {
  id: string;
  name: string;
  description: string;
  /** Number of completed restoration tasks required to unlock. */
  requiredCompletedTasks: number;
}

export const GARDEN_FEATURES: GardenFeature[] = [
  { id: 'pathway', name: 'Garden Pathway', description: 'A restored stone path.', requiredCompletedTasks: 1 },
  { id: 'bench', name: 'Wooden Bench', description: 'A cozy resting spot.', requiredCompletedTasks: 2 },
  { id: 'pond', name: 'Pond Edge', description: 'Clear the pond surroundings.', requiredCompletedTasks: 3 },
  { id: 'greenhouse', name: 'Greenhouse', description: 'Fully restored greenhouse.', requiredCompletedTasks: 4 },
];

export function computeUnlockedFeatures(completedCount: number, current: string[]): string[] {
  const unlocked = new Set(current);
  for (const f of GARDEN_FEATURES) {
    if (completedCount >= f.requiredCompletedTasks) unlocked.add(f.id);
  }
  return Array.from(unlocked);
}