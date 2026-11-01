/** Core game types for Matchy (merge-2). */

export type ChainId = 'frog' | 'flower' | 'mushroom' | 'berry' | 'plant' | 'tool' | 'woodland';

export const CHAINS: readonly ChainId[] = ['frog', 'flower', 'mushroom', 'berry', 'plant', 'tool', 'woodland'];

/** Number of tiers per chain (tier 1 = base spawn item, top tier = master). */
export const CHAIN_TIER_COUNT = 5;

export const GRID_SIZE = 7;

/** Base emoji per chain (real art replaces these later). */
export const CHAIN_EMOJI: Record<ChainId, string> = {
  frog: '🐸',
  flower: '🌸',
  mushroom: '🍄',
  berry: '🫐',
  plant: '🌿',
  tool: '🛠️',
  woodland: '🦉',
};

/** Human-readable tier labels per chain (index 0 = tier 1). */
export const CHAIN_TIER_LABELS: Record<ChainId, readonly string[]> = {
  frog: ['tadpole', 'big tadpole', 'froglet', 'frog', 'Frog Prince'],
  flower: ['seed', 'sprout', 'bud', 'bloom', 'Grand Bloom'],
  mushroom: ['spore', 'button', 'shroom', 'cap', 'Glowing Shroom'],
  berry: ['sprig', 'blossom', 'green berry', 'ripe berry', 'Berry Basket'],
  plant: ['seedling', 'sapling', 'plant', 'bush', 'Grand Tree'],
  tool: ['rusty tool', 'tool', 'fine tool', 'master tool', 'Golden Tool'],
  woodland: ['feather', 'nest', 'bird', 'owl', 'Grand Owl'],
};

export interface Item {
  /** Stable identity — lets React animate the *same* item as it moves. */
  id: number;
  chain: ChainId;
  tier: number; // 1..CHAIN_TIER_COUNT
  spawnRow?: number;
}

export interface Generator {
  /** Stable identity. */
  id: number;
  kind: 'generator';
  chain: ChainId;
}

export type Cell = Item | Generator | null;

export function isGenerator(cell: Cell): cell is Generator {
  return cell !== null && (cell as Generator).kind === 'generator';
}

export function isItem(cell: Cell): cell is Item {
  return cell !== null && (cell as Generator).kind !== 'generator' && 'tier' in (cell as Item);
}
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
  completedOrders: number; // total orders completed (drives difficulty)
}