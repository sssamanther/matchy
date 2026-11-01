import { SAVE_VERSION, type PersistedGameState } from './game/state';

const KEY = 'matchy:save';

interface SaveEnvelope {
  version: number;
  data: PersistedGameState;
}

function isBoard(v: unknown): v is PersistedGameState['board'] {
  if (!Array.isArray(v)) return false;
  if (v.length !== 7) return false;
  return v.every((row) => {
    if (!Array.isArray(row) || row.length !== 7) return false;
    return row.every((cell) => {
      if (cell === null) return true;
      if (!cell || typeof cell !== 'object') return false;
      const c = cell as Record<string, unknown>;
      if (typeof c.id !== 'number' || typeof c.chain !== 'string') return false;
      if (c.kind === 'generator') return true;
      return typeof c.tier === 'number';
    });
  });
}

function isOrders(v: unknown): v is PersistedGameState['orders'] {
  if (!Array.isArray(v)) return false;
  return v.every((o) => {
    if (!o || typeof o !== 'object') return false;
    const x = o as Record<string, unknown>;
    if (typeof x.id !== 'number') return false;
    // new format
    if (Array.isArray(x.requirements)) {
      return (x.requirements as unknown[]).every((r) => {
        if (!r || typeof r !== 'object') return false;
        const rr = r as Record<string, unknown>;
        return typeof rr.chain === 'string' && typeof rr.tier === 'number' && typeof rr.count === 'number';
      });
    }
    // legacy single-item format
    return typeof x.chain === 'string' && typeof x.tier === 'number' && typeof x.count === 'number';
  });
}

function isValidPersisted(v: unknown): v is PersistedGameState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.plotIndex !== 'number') return false;
  if (!isBoard(o.board)) return false;
  if (!isOrders(o.orders)) return false;
  if (!o.progress || typeof o.progress !== 'object') return false;
  const p = o.progress as Record<string, unknown>;
  if (typeof p.currentPlot !== 'number') return false;
  if (typeof p.stars !== 'number') return false;
  if (typeof p.plotStars !== 'number') return false;
  if (!Array.isArray(o.unlockedPlots)) return false;
  if (!o.unlockedPlots.every((n) => typeof n === 'number')) return false;
  if (o.energy !== undefined && typeof o.energy !== 'number') return false;
  if (o.energyUpdatedAt !== undefined && typeof o.energyUpdatedAt !== 'number') return false;
  return true;
}

function migrate(envelope: SaveEnvelope): PersistedGameState | null {
  if (envelope.version === SAVE_VERSION) {
    return isValidPersisted(envelope.data) ? envelope.data : null;
  }
  // Unknown/older versions: attempt best-effort if shape matches.
  if (isValidPersisted(envelope.data)) {
    return { ...envelope.data, version: SAVE_VERSION };
  }
  return null;
}

export function loadGame(): PersistedGameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const env = parsed as Partial<SaveEnvelope>;
    if (typeof env.version !== 'number' || !env.data) {
      // legacy: maybe raw persisted state without envelope
      if (isValidPersisted(parsed)) {
        return { ...(parsed as PersistedGameState), version: SAVE_VERSION };
      }
      return null;
    }
    return migrate(env as SaveEnvelope);
  } catch {
    return null;
  }
}

export function saveGame(state: PersistedGameState): boolean {
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

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}