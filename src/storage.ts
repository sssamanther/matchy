import { SAVE_VERSION, type PersistedGameState } from './game/state';

const KEY = 'matchy:save';

interface SaveEnvelope {
  version: number;
  data: PersistedGameState;
}

function isValidPersisted(v: unknown): v is PersistedGameState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.plotIndex !== 'number') return false;
  if (!Array.isArray(o.board)) return false;
  if (!Array.isArray(o.orders)) return false;
  if (!o.progress || typeof o.progress !== 'object') return false;
  if (typeof o.starsThisPlot !== 'number') return false;
  if (!Array.isArray(o.unlockedPlots)) return false;
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