import type { Plot, Source } from './types';

function src(row: number, col: number, chain: Source['chain']): Source {
  return { pos: { row, col }, chain };
}

export const PLOTS: Plot[] = [
  {
    id: 1, name: 'First Sprouts', emoji: '🌱',
    sources: [src(0, 0, 'flower'), src(6, 6, 'frog')],
    startingItems: [
      { pos: { row: 1, col: 1 }, chain: 'flower', tier: 1 },
      { pos: { row: 1, col: 2 }, chain: 'flower', tier: 1 },
      { pos: { row: 5, col: 5 }, chain: 'frog', tier: 1 },
      { pos: { row: 5, col: 4 }, chain: 'frog', tier: 1 },
    ],
    starQuota: 1,
  },
  {
    id: 2, name: 'Frog Pond', emoji: '🐸',
    sources: [src(0, 3, 'frog'), src(6, 3, 'flower')],
    starQuota: 5,
  },
  {
    id: 3, name: 'Mushroom Grove', emoji: '🍄',
    sources: [src(0, 0, 'mushroom'), src(0, 6, 'berry'), src(6, 0, 'flower'), src(6, 6, 'frog')],
    starQuota: 10,
  },
  {
    id: 4, name: 'Berry Bush', emoji: '🫐',
    sources: [src(2, 2, 'berry'), src(4, 4, 'mushroom')],
    starQuota: 15,
  },
  {
    id: 5, name: 'Garden Party', emoji: '🎉',
    sources: [src(0, 0, 'flower'), src(0, 6, 'frog'), src(6, 0, 'mushroom'), src(6, 6, 'berry')],
    starQuota: 20,
  },
];

export const STAR_QUOTAS = PLOTS.map((p) => p.starQuota);