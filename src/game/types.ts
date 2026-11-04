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

/**
 * Display names for chain generators (accessibility labels / future UI).
 * Chains without an entry fall back to a generic "<chain> generator" name.
 */
export const GENERATOR_NAMES: Partial<Record<ChainId, string>> = {
  frog: 'Frog Pond',
  mushroom: 'Mushroom Stump',
  plant: 'Potting Bench',
};

/** Generator display name for a chain. */
export function generatorName(chain: ChainId): string {
  return GENERATOR_NAMES[chain] ?? `${chain} generator`;
}

/**
 * Neutral emoji fallback used when a save references a chain this build does
 * not recognize (e.g. a save written by a future/older build). Rendered instead
 * of `undefined` so unknown-chain items can never show as an empty box.
 */
export const UNKNOWN_CHAIN_EMOJI = '❓';

/**
 * Emoji for a chain, safe for arbitrary strings. Saves are validated only for
 * *shape* (any string chain passes), so UI code must never assume the chain is
 * one this build knows about — always go through this helper instead of
 * indexing `CHAIN_EMOJI` directly.
 */
export function chainEmoji(chain: ChainId | string): string {
  return (CHAIN_EMOJI as unknown as Record<string, string | undefined>)[chain] ?? UNKNOWN_CHAIN_EMOJI;
}

/**
 * Human-readable label for a chain + tier, safe for arbitrary save data:
 * - known chain, known tier   -> e.g. "Frog", "Bouquet"
 * - known chain, unknown tier -> e.g. "Tier 9" (tiers beyond this build's set)
 * - unknown chain             -> "Item" (identity of a legacy/future chain)
 *
 * Never throws — an unreadable save must degrade to a placeholder, not crash
 * the board.
 */
export function tierLabel(chain: ChainId | string, tier: number): string {
  const labels = (CHAIN_TIER_LABELS as unknown as Record<string, readonly string[] | undefined>)[chain];
  const t = Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0;
  if (!labels) return 'Item';
  return labels[t - 1] ?? `Tier ${t}`;
}

/** Human-readable tier labels per chain (index 0 = tier 1). */
export const CHAIN_TIER_LABELS: Record<ChainId, readonly string[]> = {
  frog: ['Tadpole', 'Froglet', 'Frog', 'Pond Frog', 'Frog Prince'],
  flower: ['Seed', 'Sprout', 'Bud', 'Blossom', 'Bouquet'],
  mushroom: ['Spore', 'Toadstool', 'Spotted Mushroom', 'Forest Mushroom', 'Glowing Mushroom'],
  berry: ['sprig', 'blossom', 'green berry', 'ripe berry', 'Berry Basket'],
  plant: ['Leaf Cutting', 'Young Potted Plant', 'Potted Plant', 'Lush Houseplant', 'Majestic Monstera'],
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

export interface OrderRequirement {
  chain: ChainId;
  tier: number;
  count: number;
}

export interface Order {
  id: number;
  requirements: OrderRequirement[];
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