/**
 * Storage/inventory helpers for Matchy.
 *
 * Storage is a fixed-capacity array of slots; each slot holds exactly one
 * regular mergeable item or null (empty). Generators and sources are never
 * storable. Capacity starts at STORAGE_BASE_CAPACITY (8) and is persisted as
 * its own field, so future capacity upgrades only change that number — no
 * save migration required.
 */
import { isItem, type Cell, type Item } from './types';

/** Initial (and, for now, only) storage capacity. */
export const STORAGE_BASE_CAPACITY = 8;

export type StorageSlots = (Item | null)[];

/** Fresh storage with `capacity` empty slots. */
export function createStorage(capacity: number): StorageSlots {
  const cap = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 0;
  return new Array<Item | null>(cap).fill(null);
}

/**
 * Sanitize a persisted capacity: finite, non-negative integer — otherwise
 * fall back to the base capacity so a bad value can never poison hydration.
 */
export function normalizeCapacity(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? Math.floor(v)
    : STORAGE_BASE_CAPACITY;
}

/** Index of the first empty slot, or -1 when storage is full. */
export function firstFreeSlot(slots: StorageSlots): number {
  return slots.indexOf(null);
}

export function isStorageFull(slots: StorageSlots): boolean {
  return firstFreeSlot(slots) === -1;
}

/** Number of occupied slots — powers the "3/8 used" display. */
export function countStored(slots: StorageSlots): number {
  return slots.reduce((n, s) => (s === null ? n : n + 1), 0);
}

/** A cell may be stored only if it is a regular mergeable item. */
export function isStorable(cell: Cell): cell is Item {
  return cell !== null && isItem(cell);
}

function isStoredItem(v: unknown): v is Item {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.kind === 'generator') return false; // generators/sources are never storable
  return typeof o.id === 'number' && typeof o.chain === 'string' && typeof o.tier === 'number';
}

/** Save-validation guard: an array of slots, each null or a regular item. */
export function isStorageSlots(v: unknown): v is StorageSlots {
  return Array.isArray(v) && v.every((s) => s === null || isStoredItem(s));
}

/**
 * Defensive hydration: pad/truncate to exactly `capacity` slots and drop any
 * invalid entry, so a malformed save can never leak garbage into the game
 * state (and can never duplicate an item).
 */
export function normalizeStorage(slots: unknown, capacity: number): StorageSlots {
  const out = createStorage(capacity);
  if (!Array.isArray(slots)) return out;
  for (let i = 0; i < out.length && i < slots.length; i++) {
    const s = slots[i];
    if (s === null || isStoredItem(s)) out[i] = s;
  }
  return out;
}
