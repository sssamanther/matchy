import { SAVE_VERSION, type PersistedGameState } from './game/state';
import { isStorageSlots } from './game/inventory';
import { CHAINS, type Board, type Cell, type ChainId, type Item, type Order, type OrderRequirement, type Progress } from './game/types';
import { PLOTS } from './game/plots';

const KEY = 'matchy:save';

/**
 * Where the *original* payload is copied before anything gives up on it.
 * Written whenever a save fails validation (strict or repair), so a rejected
 * save is always recoverable and a fresh game can never silently destroy it.
 */
export const SAVE_BACKUP_KEY = 'matchy:save:backup';

/**
 * One generation of rotation: when a second, different corruption incident
 * occurs, the previous backup moves here instead of being overwritten, so at
 * most one older payload is displaced and none is silently destroyed.
 */
export const SAVE_BACKUP_PREV_KEY = 'matchy:save:backup:prev';

interface SaveEnvelope {
  version: number;
  data: PersistedGameState;
}

// ---------------------------------------------------------------------------
// Quarantine state
//
// When an existing save cannot be read, the loader returns null (the session
// starts fresh) but the *existing* save must never be overwritten until the
// player explicitly confirms starting over. `saveGame` consults these flags
// and refuses to write while a quarantined save is present.
// ---------------------------------------------------------------------------

let quarantined = false;
/** The quarantined payload was successfully copied to SAVE_BACKUP_KEY. */
let backupPreserved = false;
/** Session-once log throttles (reloads run on every render). */
let loadWarned = false;
let blockWarned = false;
let repairWarned = false;

/** Is an existing save currently unreadable (and therefore protected)? */
export function isSaveQuarantined(): boolean {
  return quarantined;
}

/** Was the quarantined payload successfully copied to the backup key? */
export function hasPreservedSaveBackup(): boolean {
  return backupPreserved;
}

function resetGuardFlags(): void {
  quarantined = false;
  loadWarned = false;
  blockWarned = false;
  repairWarned = false;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Validation (strict, unchanged semantics — returns a data-free reason)
//
// Reasons must only ever contain field names/positions, never save contents,
// so diagnostic logs cannot expose player data.
// ---------------------------------------------------------------------------

function validateBoard(v: unknown): string | null {
  if (!Array.isArray(v) || v.length !== 7) return 'board is not a 7x7 grid';
  for (let r = 0; r < v.length; r++) {
    const row = v[r];
    if (!Array.isArray(row) || row.length !== 7) return `board row ${r} malformed`;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null) continue;
      if (!cell || typeof cell !== 'object') return `board cell ${r},${c} malformed`;
      const x = cell as Record<string, unknown>;
      if (typeof x.id !== 'number') return `board cell ${r},${c} missing id`;
      if (typeof x.chain !== 'string') return `board cell ${r},${c} missing chain`;
      if (x.kind === 'generator') continue;
      if (typeof x.tier !== 'number') return `board cell ${r},${c} missing tier`;
    }
  }
  return null;
}

function validateOrders(v: unknown): string | null {
  if (!Array.isArray(v)) return 'orders is not an array';
  for (let i = 0; i < v.length; i++) {
    const o = v[i];
    if (!o || typeof o !== 'object') return `orders[${i}] malformed`;
    const x = o as Record<string, unknown>;
    if (typeof x.id !== 'number') return `orders[${i}] missing id`;
    // new format
    if (Array.isArray(x.requirements)) {
      for (let j = 0; j < x.requirements.length; j++) {
        const r = x.requirements[j];
        if (!r || typeof r !== 'object') return `orders[${i}].requirements[${j}] malformed`;
        const rr = r as Record<string, unknown>;
        if (typeof rr.chain !== 'string') return `orders[${i}].requirements[${j}] missing chain`;
        if (typeof rr.tier !== 'number') return `orders[${i}].requirements[${j}] missing tier`;
        if (typeof rr.count !== 'number') return `orders[${i}].requirements[${j}] missing count`;
      }
      continue;
    }
    // legacy single-item format
    if (typeof x.chain !== 'string') return `orders[${i}] legacy fields malformed (chain)`;
    if (typeof x.tier !== 'number') return `orders[${i}] legacy fields malformed (tier)`;
    if (x.count !== undefined && typeof x.count !== 'number') return `orders[${i}] legacy fields malformed (count)`;
  }
  return null;
}

/**
 * Field-by-field validation of a persisted save. Returns `null` when the save
 * is valid, or a short reason naming the first failing field. Semantics are
 * identical to the original `isValidPersisted` — valid saves are never
 * rejected and never modified.
 */
function validatePersisted(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'save is not an object';
  const o = v as Record<string, unknown>;
  if (typeof o.plotIndex !== 'number') return 'plotIndex missing or not a number';
  const boardReason = validateBoard(o.board);
  if (boardReason) return boardReason;
  const ordersReason = validateOrders(o.orders);
  if (ordersReason) return ordersReason;
  if (!o.progress || typeof o.progress !== 'object' || Array.isArray(o.progress)) return 'progress missing or not an object';
  const p = o.progress as Record<string, unknown>;
  if (typeof p.currentPlot !== 'number') return 'progress.currentPlot missing or not a number';
  if (typeof p.stars !== 'number') return 'progress.stars missing or not a number';
  if (typeof p.plotStars !== 'number') return 'progress.plotStars missing or not a number';
  if (!Array.isArray(o.unlockedPlots)) return 'unlockedPlots missing';
  if (!o.unlockedPlots.every((n) => typeof n === 'number')) return 'unlockedPlots malformed';
  if (o.energy !== undefined && typeof o.energy !== 'number') return 'energy malformed';
  if (o.energyUpdatedAt !== undefined && typeof o.energyUpdatedAt !== 'number') return 'energyUpdatedAt malformed';
  // Storage inventory (optional — absent on legacy saves; hydration then
  // defaults to empty storage at STORAGE_BASE_CAPACITY slots).
  if (o.storageCapacity !== undefined && typeof o.storageCapacity !== 'number') return 'storageCapacity malformed';
  if (o.storageSlots !== undefined && !isStorageSlots(o.storageSlots)) return 'storageSlots malformed';
  return null;
}

// ---------------------------------------------------------------------------
// Field-level repair (recovery for salvageable saves)
//
// Runs ONLY after strict validation fails. Keeps every piece of the save that
// can still be trusted (board items, stars, orders, storage) and defaults or
// drops only what is malformed — one bad optional field can no longer throw
// away an otherwise healthy save. Returns null when the payload cannot be
// recognized as a game save at all (no 7x7 board).
// ---------------------------------------------------------------------------

interface RepairResult {
  state: PersistedGameState;
  notes: string[];
}

function coerceCount(v: unknown, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : def;
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function repairPersisted(v: unknown): RepairResult | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const rawBoard = o.board;
  if (
    !Array.isArray(rawBoard) ||
    rawBoard.length !== 7 ||
    !rawBoard.every((row) => Array.isArray(row) && row.length === 7)
  ) {
    return null; // not recognizable as a game save
  }
  const notes: string[] = [];

  // --- plot index (clamp into the known plot list) ---
  let plotIndex = 0;
  if (typeof o.plotIndex === 'number' && Number.isFinite(o.plotIndex)) {
    plotIndex = Math.min(Math.max(0, Math.floor(o.plotIndex)), PLOTS.length - 1);
  } else {
    notes.push('plotIndex defaulted');
  }

  // --- cell repair: keep everything recognizable, assign missing ids ---
  let maxCellId = 0;
  const scanId = (c: unknown): void => {
    if (c && typeof c === 'object') {
      const id = (c as Record<string, unknown>).id;
      if (typeof id === 'number' && Number.isFinite(id)) maxCellId = Math.max(maxCellId, id);
    }
  };
  for (const row of rawBoard as unknown[]) for (const cell of row as unknown[]) scanId(cell);
  if (Array.isArray(o.storageSlots)) for (const slot of o.storageSlots) scanId(slot);
  let nextCellId = Math.floor(maxCellId) + 1;
  let assignedIds = 0;
  let droppedCells = 0;

  const repairCell = (cell: unknown): Cell | null => {
    if (cell === null || cell === undefined) return null;
    if (typeof cell !== 'object') {
      droppedCells++;
      return null;
    }
    const x = cell as Record<string, unknown>;
    if (typeof x.chain !== 'string') {
      droppedCells++;
      return null;
    }
    const id =
      typeof x.id === 'number' && Number.isFinite(x.id) ? x.id : (assignedIds++, nextCellId++);
    if (x.kind === 'generator') {
      return { id, kind: 'generator', chain: x.chain } as { id: number; kind: 'generator'; chain: ChainId };
    }
    if (typeof x.tier === 'number') {
      const item: Item = { id, chain: x.chain as ChainId, tier: x.tier };
      if (typeof x.spawnRow === 'number') item.spawnRow = x.spawnRow;
      return item;
    }
    droppedCells++; // an object with a chain but neither generator nor tier
    return null;
  };

  const board = rawBoard.map((row) => (row as unknown[]).map(repairCell)) as Board;
  if (droppedCells > 0) notes.push(`${droppedCells} malformed cell(s) dropped`);
  if (assignedIds > 0) notes.push(`${assignedIds} cell id(s) reassigned`);

  // --- orders: keep every order whose requirements can still be read ---
  let maxOrderId = 0;
  if (Array.isArray(o.orders)) {
    for (const raw of o.orders) {
      if (raw && typeof raw === 'object') {
        const id = (raw as Record<string, unknown>).id;
        if (typeof id === 'number' && Number.isFinite(id)) maxOrderId = Math.max(maxOrderId, id);
      }
    }
  }
  let nextOrderId = Math.floor(maxOrderId) + 1;
  const rawOrders: unknown[] = Array.isArray(o.orders) ? o.orders : [];
  if (!Array.isArray(o.orders)) notes.push('orders list missing');
  const orders: Order[] = [];
  let droppedOrders = 0;
  for (const raw of rawOrders) {
    if (!raw || typeof raw !== 'object') {
      droppedOrders++;
      continue;
    }
    const x = raw as Record<string, unknown>;
    const id = typeof x.id === 'number' && Number.isFinite(x.id) ? x.id : nextOrderId++;
    const requirements: OrderRequirement[] = [];
    if (Array.isArray(x.requirements)) {
      for (const rr of x.requirements) {
        if (!rr || typeof rr !== 'object') continue;
        const r = rr as Record<string, unknown>;
        if (typeof r.chain !== 'string' || typeof r.tier !== 'number') continue;
        const count = typeof r.count === 'number' && r.count > 0 ? Math.floor(r.count) : 1;
        requirements.push({ chain: r.chain as ChainId, tier: r.tier, count });
      }
    } else if (typeof x.chain === 'string' && typeof x.tier === 'number') {
      // legacy single-item order — hydration's migrateOrders accepts it as-is
      const count = typeof x.count === 'number' && x.count > 0 ? Math.floor(x.count) : 1;
      requirements.push({ chain: x.chain as ChainId, tier: x.tier, count });
    }
    if (requirements.length === 0) {
      droppedOrders++;
      continue;
    }
    orders.push({ id, requirements });
  }
  if (droppedOrders > 0) notes.push(`${droppedOrders} unreadable order(s) dropped`);

  // --- progress: default only the fields that are missing/invalid ---
  const rawProgress =
    o.progress && typeof o.progress === 'object' && !Array.isArray(o.progress)
      ? (o.progress as Record<string, unknown>)
      : (notes.push('progress defaulted'), {} as Record<string, unknown>);
  const progress: Progress = {
    currentPlot: coerceCount(rawProgress.currentPlot, plotIndex + 1),
    stars: coerceCount(rawProgress.stars, 0),
    plotStars: coerceCount(rawProgress.plotStars, 0),
    completedOrders: coerceCount(rawProgress.completedOrders, 0),
  };
  if (o.progress && typeof o.progress === 'object') {
    if (typeof rawProgress.stars !== 'number') notes.push('progress.stars defaulted');
    if (typeof rawProgress.plotStars !== 'number') notes.push('progress.plotStars defaulted');
  }

  // --- unlocked plots ---
  const plotsRaw = Array.isArray(o.unlockedPlots)
    ? o.unlockedPlots.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
  const unlockedPlots = plotsRaw.length > 0 ? Array.from(new Set(plotsRaw)) : [1];
  if (unlockedPlots.length !== plotsRaw.length || plotsRaw.length === 0) notes.push('unlockedPlots repaired');

  // --- chain lists: unknown chains (future/legacy) are removed, never invented ---
  const cleanChains = (value: unknown): ChainId[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const known = value.filter(
      (c): c is ChainId => typeof c === 'string' && (CHAINS as readonly string[]).includes(c),
    );
    if (known.length !== value.length) notes.push('unknown chains removed from chain lists');
    const unique = Array.from(new Set(known));
    return unique.length > 0 ? unique : undefined;
  };
  const unlockedChains = cleanChains(o.unlockedChains);
  const pendingGenerators = unlockedChains
    ? cleanChains(o.pendingGenerators)?.filter((c) => unlockedChains.includes(c))
    : undefined;

  // --- string lists ---
  const cleanStrings = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    return Array.from(new Set(value.filter((s): s is string => typeof s === 'string')));
  };
  const completedRestoration = cleanStrings(o.completedRestoration);
  const gardenUnlocks = cleanStrings(o.gardenUnlocks);

  // --- optional scalars: keep only plausible values (hydration has defaults) ---
  const energy = finiteNumber(o.energy);
  const energyUpdatedAt = finiteNumber(o.energyUpdatedAt);
  const starBalance = finiteNumber(o.starBalance);
  const xp = finiteNumber(o.xp);
  const level = finiteNumber(o.level);
  const storageCapacity = finiteNumber(o.storageCapacity);
  const selectedGoalId =
    typeof o.selectedGoalId === 'string'
      ? o.selectedGoalId
      : o.selectedGoalId === null
        ? null
        : undefined;

  // --- storage slots: salvage items; hydration's normalizeStorage drops
  //     anything still malformed (e.g. a smuggled generator) ---
  let storageSlots: (Item | null)[] | undefined;
  if (Array.isArray(o.storageSlots)) {
    storageSlots = o.storageSlots.map((slot) => {
      const repaired = repairCell(slot);
      if (repaired && !('tier' in repaired)) return null; // generator → empty slot
      return repaired as Item | null;
    });
  }

  return {
    state: {
      version: SAVE_VERSION,
      plotIndex,
      board,
      orders,
      progress,
      unlockedPlots,
      ...(energy !== undefined ? { energy } : {}),
      ...(energyUpdatedAt !== undefined ? { energyUpdatedAt } : {}),
      ...(starBalance !== undefined ? { starBalance } : {}),
      ...(xp !== undefined ? { xp } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(selectedGoalId !== undefined ? { selectedGoalId } : {}),
      ...(unlockedChains !== undefined ? { unlockedChains } : {}),
      ...(pendingGenerators !== undefined ? { pendingGenerators } : {}),
      ...(completedRestoration !== undefined ? { completedRestoration } : {}),
      ...(gardenUnlocks !== undefined ? { gardenUnlocks } : {}),
      ...(storageCapacity !== undefined ? { storageCapacity } : {}),
      ...(storageSlots !== undefined ? { storageSlots } : {}),
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Decode: strict first, repair second, reject last
// ---------------------------------------------------------------------------

interface DecodeResult {
  /** Decoded save, or null when the payload is unreadable. */
  state: PersistedGameState | null;
  /** Why decoding failed (data-free). */
  reason: string | null;
  /** Repair notes when the save was salvaged rather than read cleanly. */
  notes: string[];
}

function decodeSave(parsed: unknown): DecodeResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: null, reason: 'unrecognized save format (not an object)', notes: [] };
  }
  const env = parsed as Partial<SaveEnvelope>;
  // Envelope format: { version, data }. Anything else is treated as a legacy
  // raw persisted state (kept from the original loader).
  const payload: unknown = typeof env.version === 'number' && env.data ? env.data : parsed;

  const strictReason = validatePersisted(payload);
  if (strictReason === null) {
    const state = payload as PersistedGameState;
    return {
      state:
        typeof env.version === 'number' && env.version === SAVE_VERSION && payload === env.data
          ? state // current envelope: untouched
          : { ...state, version: SAVE_VERSION }, // legacy raw / older version: bump only
      reason: null,
      notes: [],
    };
  }

  const repaired = repairPersisted(payload);
  if (repaired) {
    return { state: repaired.state, reason: null, notes: repaired.notes };
  }
  return { state: null, reason: `invalid save shape: ${strictReason}`, notes: [] };
}

// ---------------------------------------------------------------------------
// Backup + quarantine
// ---------------------------------------------------------------------------

/**
 * Copy the rejected payload to SAVE_BACKUP_KEY (rotating an older, different
 * backup to SAVE_BACKUP_PREV_KEY first). Returns true only when the payload
 * verifiably sits in the backup key.
 */
function preserveRaw(raw: string, reason: string): boolean {
  try {
    const existing = localStorage.getItem(SAVE_BACKUP_KEY);
    if (existing !== raw) {
      if (existing !== null) {
        // Keep one older generation: a new incident must not destroy the last.
        try {
          localStorage.setItem(SAVE_BACKUP_PREV_KEY, existing);
        } catch {
          /* rotation is best-effort */
        }
      }
      localStorage.setItem(SAVE_BACKUP_KEY, raw);
    }
    if (localStorage.getItem(SAVE_BACKUP_KEY) !== raw) {
      console.error('[LittleWinds] SAVE BACKUP FAILED — read-back of the preserved payload did not match');
      return false;
    }
    return true;
  } catch (err) {
    // reason is data-free (field names only), so this log stays privacy-safe.
    console.error(
      '[LittleWinds] SAVE BACKUP FAILED — the unreadable save could not be copied; it will not be deleted or overwritten.',
      reason,
      errorMessage(err),
    );
    return false;
  }
}

/**
 * An existing save failed to load. Preserve the original, pause saving, and
 * return null so the session starts fresh *without* touching the old data.
 *
 * Called on every failed load (loads run per render); the payload copy is
 * idempotent and the log lines are throttled to once per quarantine episode.
 */
function quarantineSave(raw: string | null, reason: string): null {
  const first = !quarantined;
  quarantined = true;
  if (first) {
    loadWarned = false;
    blockWarned = false;
  }
  if (raw !== null) {
    backupPreserved = preserveRaw(raw, reason);
    if (!loadWarned) {
      console.warn(
        `[LittleWinds] SAVE REJECTED (${reason}) — original preserved at ${SAVE_BACKUP_KEY} ` +
          `(bytes=${raw.length}). Saving is paused so a fresh session cannot overwrite it.`,
      );
      loadWarned = true;
    }
  } else {
    backupPreserved = false;
    if (!loadWarned) {
      console.error(
        `[LittleWinds] SAVE UNREADABLE (${reason}) — the raw payload could not be copied; ` +
          'saving is paused to protect it.',
      );
      loadWarned = true;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadGame(): PersistedGameState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (err) {
    // Can't read, so we can't know whether a save exists — pause writes until
    // a later load succeeds (self-heals on the next render if transient).
    return quarantineSave(null, `storage read failed: ${errorMessage(err)}`);
  }
  if (raw === null) {
    // No save at all (fresh install): nothing to protect.
    resetGuardFlags();
    return null;
  }

  try {
    const decoded = decodeSave(JSON.parse(raw));
    if (decoded.state) {
      const wasQuarantined = quarantined;
      if (wasQuarantined) resetGuardFlags();
      if (decoded.notes.length > 0) {
        // Salvaged save: keep the original too, and report what changed.
        backupPreserved = preserveRaw(raw, `repaired: ${decoded.notes.join('; ')}`);
        if (!repairWarned) {
          console.warn(
            `[LittleWinds] Save repaired on load — ${decoded.notes.join('; ')} ` +
              `(original preserved at ${SAVE_BACKUP_KEY}).`,
          );
          repairWarned = true;
        }
      }
      return decoded.state;
    }
    return quarantineSave(raw, decoded.reason ?? 'unrecognized save format');
  } catch (err) {
    return quarantineSave(raw, `save is not valid JSON: ${errorMessage(err)}`);
  }
}

export function saveGame(state: PersistedGameState): boolean {
  // Quarantined saves are never overwritten — a fresh session must not
  // destroy the existing (unreadable) progress. The player unblocks saving
  // explicitly via clearSave (confirmed reset) or discardUnreadableSave.
  if (quarantined) {
    if (!blockWarned) {
      console.warn(
        `[LittleWinds] SAVE BLOCKED — the existing save is unreadable and quarantined; ` +
          `this session is not persisted. Original kept at ${SAVE_BACKUP_KEY}.`,
      );
      blockWarned = true;
    }
    return false;
  }
  const envelope: SaveEnvelope = { version: SAVE_VERSION, data: { ...state, version: SAVE_VERSION } };
  let json: string;
  try {
    json = JSON.stringify(envelope);
  } catch (err) {
    console.error('[LittleWinds] Save failed: serialization error', err);
    return false;
  }
  // Write, then verify by reading back; retry once on failure.
  // (2026-11-01 incident: a WebView process persisted nothing for ~52s of
  // play and the empty `catch` hid it entirely — a hard process kill then
  // rolled back ~22 stars of progress. Failing saves must never be silent.)
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      localStorage.setItem(KEY, json);
      if (localStorage.getItem(KEY) === json) return true;
      lastError = new Error('write verification mismatch (stored value differs)');
    } catch (err) {
      lastError = err;
    }
  }
  console.error('[LittleWinds] SAVE FAILED — progress since the last successful save may be lost on restart', lastError);
  return false;
}

/**
 * Re-save the latest state when the page is hidden or the WebView is torn
 * down. Hard process kills (adb force-stop, APK-update kills) run no app
 * code at all, but *backgrounding* does — and WebView localStorage commits
 * are asynchronous, so re-issuing the write on hide closes the window in
 * which a later kill can lose the most recent actions.
 *
 * Returns a cleanup function that removes the listeners.
 */
export function installLifecycleSaveFlush(
  getSnapshot: () => PersistedGameState | null,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null =
    typeof document === 'undefined' ? null : document,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null =
    typeof window === 'undefined' ? null : window,
): () => void {
  if (!doc || !win) return () => {};
  const flush = () => {
    const snapshot = getSnapshot();
    if (snapshot) saveGame(snapshot);
  };
  const onVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') flush();
  };
  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('pagehide', flush);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    win.removeEventListener('pagehide', flush);
  };
}

/**
 * Delete the primary save (explicit player-confirmed reset). The preserved
 * backup, when one exists, is intentionally kept for recovery.
 *
 * Refuses to delete when a quarantined save could NOT be backed up — losing
 * the only copy of a player's progress is never acceptable.
 */
export function clearSave(): void {
  if (quarantined && !backupPreserved) {
    let primaryExists = true;
    try {
      primaryExists = localStorage.getItem(KEY) !== null;
    } catch {
      primaryExists = true; // unreadable — assume it exists
    }
    if (primaryExists) {
      console.error(
        '[LittleWinds] SAVE RESET REFUSED — the unreadable save has no preserved backup; keeping it to avoid data loss.',
      );
      return;
    }
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  resetGuardFlags();
  backupPreserved = false;
}

/**
 * Explicit confirmation path for an unreadable save: drop the quarantined
 * primary (already preserved at SAVE_BACKUP_KEY) and unblock saving for the
 * fresh session. The backup is never deleted here.
 *
 * Returns false — leaving everything untouched — when there is no quarantine
 * or the original could not be backed up.
 */
export function discardUnreadableSave(): boolean {
  if (!quarantined) return false;
  if (!backupPreserved) {
    console.error(
      '[LittleWinds] SAVE DISCARD REFUSED — the unreadable save has no preserved backup; keeping it to avoid data loss.',
    );
    return false;
  }
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.error('[LittleWinds] SAVE DISCARD FAILED — could not remove the unreadable save', errorMessage(err));
    return false;
  }
  console.warn(
    `[LittleWinds] Unreadable save discarded after explicit confirmation — original still preserved at ${SAVE_BACKUP_KEY}.`,
  );
  resetGuardFlags();
  return true;
}
