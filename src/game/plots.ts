import type { Plot, Source } from './types';

function src(row: number, col: number, chain: Source['chain']): Source {
  return { pos: { row, col }, chain };
}

export const PLOTS: Plot[] = [
  {
    id: 1, name: 'First Sprouts', emoji: '🌱',
    sources: [src(0, 0, 'flower'), src(6, 6, 'frog')],
    starQuota: 3,
  },
  {
    id: 2, name: 'Frog Pond', emoji: '🐸',
    sources: [src(0, 3, 'frog'), src(6, 3, 'flower')],
    starQuota: 10,
  },
  {
    id: 3, name: 'Mushroom Grove', emoji: '🍄',
    sources: [src(0, 0, 'mushroom'), src(0, 6, 'berry'), src(6, 0, 'flower'), src(6, 6, 'frog')],
    starQuota: 20,
  },
  {
    id: 4, name: 'Berry Bush', emoji: '🫐',
    sources: [src(2, 2, 'berry'), src(4, 4, 'mushroom')],
    starQuota: 35,
  },
  {
    id: 5, name: 'Garden Party', emoji: '🎉',
    sources: [src(0, 0, 'flower'), src(0, 6, 'frog'), src(6, 0, 'mushroom'), src(6, 6, 'berry')],
    starQuota: 55,
  },
];

export const STAR_QUOTAS = PLOTS.map((p) => p.starQuota);