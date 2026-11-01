import { ENERGY_CONFIG } from './energyConfig';

export interface EnergyState {
  energy: number;
  energyUpdatedAt: number;
}

export function clampEnergy(value: number): number {
  if (!Number.isFinite(value)) return ENERGY_CONFIG.maxEnergy;
  return Math.max(0, Math.min(ENERGY_CONFIG.maxEnergy, Math.floor(value)));
}

export function regenerateEnergy(
  energy: number,
  energyUpdatedAt: number,
  now: number,
): EnergyState {
  const safeEnergy = clampEnergy(energy);
  const safeUpdated = Number.isFinite(energyUpdatedAt) ? energyUpdatedAt : now;
  // backward clock
  if (now < safeUpdated) {
    return { energy: safeEnergy, energyUpdatedAt: safeUpdated };
  }
  if (safeEnergy >= ENERGY_CONFIG.maxEnergy) {
    return { energy: ENERGY_CONFIG.maxEnergy, energyUpdatedAt: now };
  }
  const elapsed = now - safeUpdated;
  const points = Math.floor(elapsed / ENERGY_CONFIG.regenIntervalMs);
  if (points <= 0) {
    return { energy: safeEnergy, energyUpdatedAt: safeUpdated };
  }
  const newEnergy = Math.min(ENERGY_CONFIG.maxEnergy, safeEnergy + points);
  if (newEnergy >= ENERGY_CONFIG.maxEnergy) {
    return { energy: ENERGY_CONFIG.maxEnergy, energyUpdatedAt: now };
  }
  return { energy: newEnergy, energyUpdatedAt: safeUpdated + points * ENERGY_CONFIG.regenIntervalMs };
}

export function spendEnergy(energy: number, amount: number): number {
  return clampEnergy(energy - amount);
}

/**
 * DEV-ONLY (temporary): instantly restore energy to max and restart the
 * normal regeneration clock exactly as if the tank had filled naturally.
 * Used by the debug "Refill Energy" button — see src/dev/devTools.ts.
 */
export function refillEnergy(now: number): EnergyState {
  return { energy: ENERGY_CONFIG.maxEnergy, energyUpdatedAt: now };
}