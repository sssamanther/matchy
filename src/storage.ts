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
    return typeof x.id === 'number' && typeof x.chain === 'string' && typeof x.tier === 'number' && typeof x.count === 'number';
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

export function saveGame(state: PersistedGameState): void {
  try {
    const envelope: SaveEnvelope = { version: SAVE_VERSION, data: { ...state, version: SAVE_VERSION } };
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    /* ignore */
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}