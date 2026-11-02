import type { ChainId } from './types';

/**
 * Centralized artwork lookup for merge items and generators.
 *
 * Artwork is keyed by **chain + tier** (never by display name — different
 * chains can share names, e.g. Berry tier 2 is also called "Blossom").
 *
 * Only chains whose illustrated assets actually exist in
 * `public/assets/` are listed here. To onboard the next chain
 * (mushroom, berry, frog, plant, tool, woodland), add its per-tier
 * paths (indexed by tier - 1) to ITEM_ART and/or its generator path
 * to GENERATOR_ART — nothing else needs to change.
 */
const ITEM_ART: Partial<Record<ChainId, readonly string[]>> = {
  flower: [
    '/assets/items/flower-1-seed.png',
    '/assets/items/flower-2-sprout.png',
    '/assets/items/flower-3-bud.png',
    '/assets/items/flower-4-blossom.png',
    '/assets/items/flower-5-bouquet.png',
  ],
};

const GENERATOR_ART: Partial<Record<ChainId, string>> = {
  flower: '/assets/generators/flower.png',
};

/**
 * Absolute path of the illustration for a chain+tier item, or `null` when
 * the chain has no artwork yet (or the tier is out of range) — callers
 * fall back to the chain emoji in that case.
 */
export function itemArt(chain: ChainId, tier: number): string | null {
  return ITEM_ART[chain]?.[tier - 1] ?? null;
}

/**
 * Absolute path of the illustration for a chain's generator, or `null`
 * when the chain has no generator artwork yet.
 */
export function generatorArt(chain: ChainId): string | null {
  return GENERATOR_ART[chain] ?? null;
}
