/** Core game types for Matchy (merge-2). */

export type ChainId = 'frog' | 'flower' | 'mushroom' | 'berry';

export const CHAINS: readonly ChainId[] = ['frog', 'flower', 'mushroom', 'berry'];

/** Number of tiers per chain (tier 1 = base spawn item, top tier = master). */
export const CHAIN_TIER_COUNT = 5;

export const GRID_SIZE = 7;

/** Base emoji per chain (real art replaces these later). */
export const CHAIN_EMOJI: Record<ChainId, string> = {
  frog: '🐸',
  flower: '🌸',
  mushroom: '🍄',
  berry: '🫐',
};

/** Human-readable tier labels per chain (index 0 = tier 1). */
export const CHAIN_TIER_LABELS: Record<ChainId, readonly string[]> = {
  frog: ['tadpole', 'big tadpole', 'froglet', 'frog', 'Frog Prince'],
  flower: ['seed', 'sprout', 'bud', 'bloom', 'Grand Bloom'],
  mushroom: ['spore', 'button', 'shroom', 'cap', 'Glowing Shroom'],
  berry: ['sprig', 'blossom', 'green berry', 'ripe berry', 'Berry Basket'],
};

export interface Item {
  /** Stable identity — lets React animate the *same* item as it moves. */
  id: number;
  chain: ChainId;
  tier: number; // 1..CHAIN_TIER_COUNT
  spawnRow?: number;
}

export type Cell = Item | null;
/** grid[row][col] */
export type Board = Cell[][];

export interface Position {
  row: number;
  col: number;
}

export interface Source {
  pos: Position;
  chain: ChainId;
}

export interface Order {
  id: number;
  chain: ChainId;
  tier: number;
  count: number;
}

export interface Plot {
  id: number;
  name: string;
  emoji: string;
  sources: Source[];
  startingItems?: { pos: Position; chain: ChainId; tier: number }[];
  starQuota: number;
}

export interface Progress {
  currentPlot: number;
  stars: number; // lifetime stars (global Garden Level)
  plotStars: number; // stars earned on current plot
}