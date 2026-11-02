import { describe, expect, it } from 'vitest';
import { generatorArt, itemArt } from './art';
import { CHAIN_EMOJI, CHAIN_TIER_COUNT, CHAIN_TIER_LABELS, CHAINS } from './types';

const FLOWER_TIER_ART: Array<{ tier: number; path: string; name: string }> = [
  { tier: 1, path: '/assets/items/flower-1-seed.png', name: 'Seed' },
  { tier: 2, path: '/assets/items/flower-2-sprout.png', name: 'Sprout' },
  { tier: 3, path: '/assets/items/flower-3-bud.png', name: 'Bud' },
  { tier: 4, path: '/assets/items/flower-4-blossom.png', name: 'Blossom' },
  { tier: 5, path: '/assets/items/flower-5-bouquet.png', name: 'Bouquet' },
];

describe('flower artwork mapping (chain + tier)', () => {
  it('maps every flower tier to its exact illustration', () => {
    for (const { tier, path } of FLOWER_TIER_ART) {
      expect(itemArt('flower', tier)).toBe(path);
    }
  });

  it('maps the flower generator to its illustration', () => {
    expect(generatorArt('flower')).toBe('/assets/generators/flower.png');
  });

  it('keeps the five-tier structure (no tier 6)', () => {
    expect(CHAIN_TIER_COUNT).toBe(5);
    expect(CHAIN_TIER_LABELS.flower).toHaveLength(5);
    // future tier 6 ("Floral Arrangement") is deliberately not mapped yet
    expect(itemArt('flower', 6)).toBeNull();
  });
});

describe('flower display names', () => {
  it('uses the exact five display names', () => {
    expect(CHAIN_TIER_LABELS.flower).toEqual(['Seed', 'Sprout', 'Bud', 'Blossom', 'Bouquet']);
  });
});

describe('emoji fallbacks for chains without artwork', () => {
  it('returns null for every tier of unillustrated chains', () => {
    for (const chain of CHAINS) {
      if (chain === 'flower') continue;
      for (let tier = 1; tier <= CHAIN_TIER_COUNT; tier++) {
        expect(itemArt(chain, tier)).toBeNull();
      }
      expect(generatorArt(chain)).toBeNull();
    }
  });

  it('preserves the existing emoji map untouched', () => {
    expect(CHAIN_EMOJI).toEqual({
      frog: '🐸',
      flower: '🌸',
      mushroom: '🍄',
      berry: '🫐',
      plant: '🌿',
      tool: '🛠️',
      woodland: '🦉',
    });
  });
});

describe('artwork is keyed by chain+tier, never by display name', () => {
  it('does not leak flower art onto the berry "blossom" item', () => {
    // Berry tier 2 shares the display name with Flower tier 4 — but the
    // Berry item must keep its emoji and its own (unchanged) name.
    expect(itemArt('berry', 2)).toBeNull();
    expect(itemArt('flower', 4)).toBe('/assets/items/flower-4-blossom.png');
    expect(CHAIN_TIER_LABELS.berry[1]).toBe('blossom');
  });

  it('returns null for out-of-range tiers instead of a wrong image', () => {
    expect(itemArt('flower', 0)).toBeNull();
    expect(itemArt('flower', 6)).toBeNull();
    expect(itemArt('frog', 99)).toBeNull();
  });
});
