import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, gameReducer, type GameState } from './state';
import { resetItemIds } from './board';
import { ENERGY_CONFIG } from './energyConfig';
import { PLOTS } from './plots';

beforeEach(() => {
  resetItemIds();
});

const T_REFILL = 2_000_000;

function lowEnergyState(): GameState {
  // deterministic clock; starts at max energy, then drain it
  const s = createInitialState(null, T_REFILL / 2);
  return { ...s, energy: 5, energyUpdatedAt: T_REFILL / 2 };
}

describe('DEV_REFILL_ENERGY (temporary debug button)', () => {
  it('restores energy to the existing maximum and restarts the regen clock', () => {
    const s = lowEnergyState();
    const next = gameReducer(s, { type: 'DEV_REFILL_ENERGY', now: T_REFILL });
    expect(next.energy).toBe(ENERGY_CONFIG.maxEnergy);
    expect(next.energyUpdatedAt).toBe(T_REFILL);
  });

  it('is idempotent when energy is already full', () => {
    const s = createInitialState(null, T_REFILL / 2); // starts at max
    const next = gameReducer(s, { type: 'DEV_REFILL_ENERGY', now: T_REFILL });
    expect(next.energy).toBe(ENERGY_CONFIG.maxEnergy);
    expect(next.energyUpdatedAt).toBe(T_REFILL);
  });

  it('does not consume stars, grant XP, or modify orders, board or garden progress', () => {
    const s = lowEnergyState();
    const next = gameReducer(s, { type: 'DEV_REFILL_ENERGY', now: T_REFILL });

    // energy fields are the ONLY difference
    const strip = (st: GameState) => ({ ...st, energy: 0, energyUpdatedAt: 0 });
    expect(strip(next)).toEqual(strip(s));

    // explicitly: no economy / progression side effects
    expect(next.starBalance).toBe(s.starBalance);
    expect(next.xp).toBe(s.xp);
    expect(next.level).toBe(s.level);
    expect(next.progress).toEqual(s.progress);
    expect(next.orders).toEqual(s.orders);
    expect(next.board).toEqual(s.board);
    expect(next.completedRestoration).toEqual(s.completedRestoration);
    expect(next.gardenUnlocks).toEqual(s.gardenUnlocks);
    expect(next.plotIndex).toBe(s.plotIndex);
    expect(next.unlockedPlots).toEqual(s.unlockedPlots);
    expect(next.unlockedChains).toEqual(s.unlockedChains);
  });

  it('does not copy or reset the objects it must not touch', () => {
    const s = lowEnergyState();
    const next = gameReducer(s, { type: 'DEV_REFILL_ENERGY', now: T_REFILL });
    expect(next.board).toBe(s.board);
    expect(next.orders).toBe(s.orders);
    expect(next.progress).toBe(s.progress);
  });

  it('preserves the normal regeneration system and its timing afterwards', () => {
    const refilled = gameReducer(lowEnergyState(), { type: 'DEV_REFILL_ENERGY', now: T_REFILL });
    expect(refilled.energy).toBe(ENERGY_CONFIG.maxEnergy);

    // spend one point via the regular generator mechanic -> 99
    const genPos = PLOTS[0].sources[0].pos;
    const spent = gameReducer(refilled, { type: 'TAP_GENERATOR', pos: genPos });
    expect(spent.energy).toBe(ENERGY_CONFIG.maxEnergy - ENERGY_CONFIG.generatorCost);

    // exactly one regen interval later -> +1, clock advances by the interval
    const t = T_REFILL + ENERGY_CONFIG.regenIntervalMs;
    const regen = gameReducer(spent, { type: 'REGENERATE', now: t });
    expect(regen.energy).toBe(ENERGY_CONFIG.maxEnergy);
    expect(regen.energyUpdatedAt).toBe(t);

    // and not a free tick before the interval elapses
    const early = gameReducer(spent, { type: 'REGENERATE', now: t - 1 });
    expect(early.energy).toBe(ENERGY_CONFIG.maxEnergy - ENERGY_CONFIG.generatorCost);
  });
});
