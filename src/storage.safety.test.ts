import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_BACKUP_KEY,
  SAVE_BACKUP_PREV_KEY,
  clearSave,
  discardUnreadableSave,
  hasPreservedSaveBackup,
  installLifecycleSaveFlush,
  isSaveQuarantined,
  loadGame,
  saveGame,
} from './storage';
import { createInitialState, toPersisted } from './game/state';
import { resetItemIds } from './game/board';
import { CHAINS } from './game/types';

// In-memory localStorage (same pattern as storage.persistence.test.ts).
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    for (const k in store) delete store[k];
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

const KEY = 'matchy:save';
const T0 = 1_000_000;

function freshPersisted() {
  return toPersisted(createInitialState(null, T0));
}

beforeEach(() => {
  vi.restoreAllMocks(); // restore any getItem/setItem spies before touching flags
  resetItemIds();
  localStorageMock.clear();
  clearSave(); // resets quarantine flags (primary already gone → never refuses)
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Original payload preservation
// ---------------------------------------------------------------------------

describe('original save preservation on validation failure', () => {
  it('keeps the corrupt payload intact, backs it up, and quarantines', () => {
    const raw = '{bad json';
    store[KEY] = raw;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadGame()).toBeNull();

    expect(store[KEY]).toBe(raw); // primary untouched
    expect(store[SAVE_BACKUP_KEY]).toBe(raw); // original preserved
    expect(isSaveQuarantined()).toBe(true);
    expect(hasPreservedSaveBackup()).toBe(true);
    expect(String(warn.mock.calls[0][0])).toContain('SAVE REJECTED');
    expect(String(warn.mock.calls[0][0])).toContain('preserved');
  });

  it('preserves the original when the save shape is invalid beyond repair', () => {
    const raw = JSON.stringify({ version: 1, data: { foo: 1 } }); // no board → unrecognized
    store[KEY] = raw;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadGame()).toBeNull();
    expect(store[KEY]).toBe(raw);
    expect(store[SAVE_BACKUP_KEY]).toBe(raw);
    expect(isSaveQuarantined()).toBe(true);
  });

  it('does not create any backup for a healthy save', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(saveGame(freshPersisted())).toBe(true);

    expect(loadGame()).not.toBeNull();
    expect(Object.keys(store)).toEqual([KEY]);
    expect(isSaveQuarantined()).toBe(false);
    expect(hasPreservedSaveBackup()).toBe(false);
  });

  it('rotates an older, different backup instead of destroying it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store[KEY] = 'first-corruption';
    expect(loadGame()).toBeNull();
    expect(store[SAVE_BACKUP_KEY]).toBe('first-corruption');

    store[KEY] = 'second-corruption';
    expect(loadGame()).toBeNull();
    expect(store[SAVE_BACKUP_KEY]).toBe('second-corruption');
    expect(store[SAVE_BACKUP_PREV_KEY]).toBe('first-corruption');
  });

  it('does not rotate when the identical payload fails again', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store[KEY] = '{same broken payload';
    expect(loadGame()).toBeNull();
    expect(loadGame()).toBeNull();
    expect(store[SAVE_BACKUP_KEY]).toBe('{same broken payload');
    expect(store[SAVE_BACKUP_PREV_KEY]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Fresh sessions never overwrite a quarantined save
// ---------------------------------------------------------------------------

describe('quarantined saves cannot be overwritten by a fresh session', () => {
  it('saveGame refuses, leaves the original byte-identical, and says so once', () => {
    const raw = '{bad json';
    store[KEY] = raw;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame()).toBeNull();
    warn.mockClear(); // ignore the load-rejection line; observe save attempts only

    const fresh = freshPersisted();
    expect(saveGame(fresh)).toBe(false);
    expect(saveGame(fresh)).toBe(false);

    expect(store[KEY]).toBe(raw); // still byte-identical
    expect(warn).toHaveBeenCalledTimes(1); // throttled: one clear warning
    expect(String(warn.mock.calls[0][0])).toContain('SAVE BLOCKED');
  });

  it('the lifecycle background flush also cannot overwrite it', () => {
    const raw = '{bad json';
    store[KEY] = raw;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame()).toBeNull();

    const listeners: Record<string, Array<() => void>> = {};
    const on = (t: string, l: () => void) => {
      (listeners[t] ??= []).push(l);
    };
    const off = (t: string, l: () => void) => {
      listeners[t] = (listeners[t] ?? []).filter((f) => f !== l);
    };
    const doc = { visibilityState: 'visible' as string, addEventListener: on, removeEventListener: off };
    const win = { addEventListener: on, removeEventListener: off };
    const fresh = freshPersisted();
    const uninstall = installLifecycleSaveFlush(() => fresh, doc as never, win as never);

    doc.visibilityState = 'hidden';
    (listeners['visibilitychange'] ?? []).forEach((f) => f());
    (listeners['pagehide'] ?? []).forEach((f) => f());

    expect(store[KEY]).toBe(raw);
    expect(store[SAVE_BACKUP_KEY]).toBe(raw);
    uninstall();
  });

  it('clearSave (explicit reset) unblocks saving but keeps the backup', () => {
    const raw = '{bad json';
    store[KEY] = raw;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame()).toBeNull();

    clearSave();

    expect(store[KEY]).toBeUndefined(); // explicit reset removed the primary
    expect(store[SAVE_BACKUP_KEY]).toBe(raw); // backup retained
    expect(isSaveQuarantined()).toBe(false);
    expect(saveGame(freshPersisted())).toBe(true); // fresh game can save again
  });

  it('discardUnreadableSave drops the primary only, keeping the backup', () => {
    const raw = '{bad json';
    store[KEY] = raw;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame()).toBeNull();

    expect(discardUnreadableSave()).toBe(true);
    expect(store[KEY]).toBeUndefined();
    expect(store[SAVE_BACKUP_KEY]).toBe(raw);
    expect(isSaveQuarantined()).toBe(false);
    expect(saveGame(freshPersisted())).toBe(true);
    expect(discardUnreadableSave()).toBe(false); // no quarantine → no-op
  });

  it('refuses discard AND clearSave when the backup could not be preserved', () => {
    store[KEY] = '{bad json';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalSet = localStorageMock.setItem;
    vi.spyOn(localStorageMock, 'setItem').mockImplementation((k, v) => {
      if (k === SAVE_BACKUP_KEY) throw new Error('QuotaExceededError');
      originalSet(k, v);
    });

    expect(loadGame()).toBeNull();
    expect(String(err.mock.calls.map((c) => c.map(String).join(' ')).join(' '))).toContain(
      'SAVE BACKUP FAILED',
    );
    expect(hasPreservedSaveBackup()).toBe(false);

    vi.restoreAllMocks();
    expect(discardUnreadableSave()).toBe(false);
    expect(store[KEY]).toBe('{bad json'); // still untouched
    expect(isSaveQuarantined()).toBe(true);

    clearSave();
    expect(store[KEY]).toBe('{bad json'); // reset refused too
    expect(isSaveQuarantined()).toBe(true);
  });

  it('a transient storage read failure pauses saving, then self-heals on the next load', () => {
    const s = freshPersisted();
    expect(saveGame(s)).toBe(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(localStorageMock, 'getItem').mockImplementationOnce(() => {
      throw new Error('transient IO');
    });

    expect(loadGame()).toBeNull();
    expect(isSaveQuarantined()).toBe(true);
    expect(err.mock.calls.map((c) => c.map(String).join(' ')).join(' ')).toContain('SAVE UNREADABLE');

    vi.restoreAllMocks();
    expect(loadGame()).toEqual(s); // storage readable again
    expect(isSaveQuarantined()).toBe(false);
    expect(saveGame(s)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Diagnostic logging stays privacy-safe
// ---------------------------------------------------------------------------

describe('diagnostic logging', () => {
  it('reports the rejection reason and size without ever logging save contents', () => {
    const raw = JSON.stringify({ version: 1, data: { note: 'SARAH-PRIVATE-TOKEN', foo: 1 } });
    store[KEY] = raw;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(loadGame()).toBeNull();

    const logged = [...warn.mock.calls, ...err.mock.calls].flat().map(String).join(' ');
    expect(logged).toContain('SAVE REJECTED');
    expect(logged).toMatch(/bytes=\d+/);
    expect(logged).not.toContain('SARAH-PRIVATE-TOKEN'); // payload never leaks
    expect(logged).not.toContain('SARAH'); // nor any part of it
  });

  it('reports a repair with field names only, never values', () => {
    store[KEY] = JSON.stringify({
      version: 1,
      data: { ...freshPersisted(), progress: { currentPlot: 1, stars: 77 } }, // plotStars missing
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const logged = warn.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('repaired');
    expect(logged).toContain('progress.plotStars');
    expect(logged).not.toContain('77'); // the value itself is not echoed
  });
});

// ---------------------------------------------------------------------------
// 4. Salvage instead of rejection (valid progress is not thrown away)
// ---------------------------------------------------------------------------

describe('recovery of salvageable saves', () => {
  it('repairs missing progress fields instead of rejecting the save', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const core = freshPersisted();
    const raw = JSON.stringify({
      version: 1,
      data: { ...core, progress: { currentPlot: 1, stars: 42 } },
    });
    store[KEY] = raw;

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(isSaveQuarantined()).toBe(false); // recovered, saving continues
    expect(loaded!.progress.stars).toBe(42); // progress kept
    expect(loaded!.progress.plotStars).toBe(0); // missing field defaulted
    expect(loaded!.progress.completedOrders).toBe(0);
    expect(loaded!.board).toEqual(core.board); // untouched
    expect(loaded!.orders).toEqual(core.orders); // untouched
    expect(store[SAVE_BACKUP_KEY]).toBe(raw); // original still preserved
  });

  it('assigns ids to cells that are missing them, uniquely and without touching others', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const core = freshPersisted();
    const broken = JSON.parse(JSON.stringify(core)) as typeof core;
    const originalCell = broken.board[0][0];
    delete (originalCell as unknown as Record<string, unknown>).id;
    store[KEY] = JSON.stringify({ version: 1, data: broken });

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    const repaired = loaded!.board[0][0] as { id: number };
    expect(typeof repaired.id).toBe('number');
    // every cell id unique
    const ids = loaded!.board.flat().filter(Boolean).map((c) => (c as { id: number }).id);
    expect(new Set(ids).size).toBe(ids.length);
    // a neighbouring cell kept its original identity
    expect(loaded!.board[6][6]).toEqual(core.board[6][6]);
  });

  it('drops only the malformed cell and keeps the rest of the save', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const core = freshPersisted();
    const broken = JSON.parse(JSON.stringify(core)) as typeof core;
    broken.board[0][0] = { foo: 1 } as never; // unrecognizable cell
    store[KEY] = JSON.stringify({ version: 1, data: broken });

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(isSaveQuarantined()).toBe(false);
    expect(loaded!.board[0][0]).toBeNull(); // only the bad cell is gone
    expect(loaded!.board[6][6]).toEqual(core.board[6][6]);
    expect(loaded!.progress.stars).toBe(core.progress.stars);
  });

  it('accepts an order list that is missing entirely and regenerates orders on hydration', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const core = freshPersisted();
    store[KEY] = JSON.stringify({
      version: 1,
      data: { ...core, orders: 'nope', progress: { ...core.progress, stars: 42 } },
    });

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(isSaveQuarantined()).toBe(false);
    expect(loaded!.orders).toEqual([]);

    const resumed = createInitialState(loaded, T0);
    expect(resumed.orders.length).toBeGreaterThan(0); // never stranded without orders
    expect(resumed.progress.stars).toBe(42); // progress kept
  });

  it('regenerates orders for an (already valid) empty order list without touching progress', () => {
    const core = freshPersisted();
    store[KEY] = JSON.stringify({
      version: 1,
      data: { ...core, orders: [], progress: { ...core.progress, stars: 42 } },
    });

    const loaded = loadGame(); // empty array passes strict validation
    expect(loaded).not.toBeNull();
    expect(isSaveQuarantined()).toBe(false);

    const resumed = createInitialState(loaded, T0);
    expect(resumed.orders.length).toBeGreaterThan(0);
    expect(resumed.progress.stars).toBe(42);
    expect(resumed.board).toEqual(core.board);
  });
});

// ---------------------------------------------------------------------------
// 5. Backward compatibility (existing Android saves keep loading)
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('loads a legacy raw save without the envelope wrapper', () => {
    const s = freshPersisted();
    store[KEY] = JSON.stringify(s); // raw persisted state, no {version,data}
    expect(loadGame()).toEqual(s);
    expect(isSaveQuarantined()).toBe(false);
  });

  it('loads an envelope written by an unknown older/newer version', () => {
    const s = freshPersisted();
    store[KEY] = JSON.stringify({ version: 99, data: s });
    expect(loadGame()).toEqual(s); // best-effort migration, version bumped
    expect(isSaveQuarantined()).toBe(false);
  });

  it('keeps the current envelope format byte-stable for healthy saves', () => {
    const s = freshPersisted();
    expect(saveGame(s)).toBe(true);
    const parsed = JSON.parse(store[KEY]) as { version: number; data: Record<string, unknown> };
    expect(parsed.version).toBe(1);
    expect(parsed.data.plotIndex).toBe(s.plotIndex);
    expect(Object.keys(store)).toEqual([KEY]); // no backup side-effects
  });

  it('filters chain ids this build does not recognize out of unlockedChains', () => {
    const core = freshPersisted();
    store[KEY] = JSON.stringify({
      version: 1,
      data: { ...core, unlockedChains: ['frog', 'ghost-chain', 'flower'], pendingGenerators: ['ghost-chain'] },
    });
    const loaded = loadGame(); // shape is valid — loads as-is
    expect(loaded).not.toBeNull();
    expect(isSaveQuarantined()).toBe(false);

    const resumed = createInitialState(loaded, T0);
    expect(resumed.unlockedChains).toEqual(['frog', 'flower']);
    expect(resumed.pendingGenerators).toEqual([]);
    // no order can ever request an unknown chain
    for (const order of resumed.orders) {
      for (const req of order.requirements) {
        expect(CHAINS).toContain(req.chain);
      }
    }
  });

  it('round-trips a healthy save with no repair and no backup', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = freshPersisted();
    expect(saveGame(s)).toBe(true);
    expect(loadGame()).toEqual(s);
    expect(store[SAVE_BACKUP_KEY]).toBeUndefined();
    expect(isSaveQuarantined()).toBe(false);
  });
});
