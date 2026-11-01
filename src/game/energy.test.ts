import { describe, expect, it } from 'vitest';
import { regenerateEnergy } from './energy';

describe('energy regeneration', () => {
  it('regenerates after 60s', () => {
    const r = regenerateEnergy(50, 0, 60000);
    expect(r.energy).toBe(51);
  });
  it('partial time preserved', () => {
    const r = regenerateEnergy(50, 0, 30000);
    expect(r.energy).toBe(50);
    expect(r.energyUpdatedAt).toBe(0);
  });
  it('stops at max', () => {
    const r = regenerateEnergy(100, 0, 120000);
    expect(r.energy).toBe(100);
  });
  it('no hidden time at full', () => {
    const r = regenerateEnergy(100, 0, 120000);
    expect(r.energyUpdatedAt).toBe(120000);
  });
  it('backward clock no energy', () => {
    const r = regenerateEnergy(50, 1000, 500);
    expect(r.energy).toBe(50);
    expect(r.energyUpdatedAt).toBe(1000);
  });
  it('offline long period caps at max', () => {
    const r = regenerateEnergy(0, 0, 100 * 60000);
    expect(r.energy).toBe(100);
  });
});