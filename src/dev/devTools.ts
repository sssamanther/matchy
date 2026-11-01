/**
 * TEMPORARY — developer-only tooling gate for Little Winds.
 *
 * This folder (`src/dev/`) can be deleted together with every `DEV-ONLY`
 * marker in: `state.ts`, `energy.ts`, `useGame.ts`, `EnergyBar.tsx`,
 * `App.tsx`, `vite.config.ts` and `package.json`.
 *
 * A dev tool is visible only when at least one DEBUG signal is present.
 * Every signal defaults to OFF, so release builds are safe by default:
 *
 *  1. Build flag: `npm run build:devtools` (`vite build --mode devtools`)
 *     bakes `__LITTLEWINDS_DEV_TOOLS__ = true` into the web assets. The
 *     normal `npm run build` (used for the production web build and for
 *     Android release assets) bakes `false`. This is the signal that makes
 *     the tools available in Android *debug* APKs even though Capacitor
 *     packages production-built web assets — it does NOT rely on
 *     `import.meta.env.DEV`, which is always `false` in any `vite build`.
 *  2. Native debug override: a debug-only native layer may set
 *     `window.__LITTLEWINDS_DEV_TOOLS__ = true` at runtime. Release builds
 *     never set it (absent/false = off).
 *  3. `import.meta.env.DEV` — true only for the local `npm run dev` server;
 *     statically `false` in every `vite build` output, so it can never ship
 *     in a release build, and it is never the only signal used for Android.
 */

export interface DevToolsSignals {
  /** Baked in at build time by `vite build --mode devtools`. */
  buildFlag?: boolean;
  /** Set at runtime by a debug-only native layer. */
  nativeFlag?: boolean;
  /** True only on the local `npm run dev` server. */
  viteDev?: boolean;
}

/**
 * Pure decision function — kept separate from the environment reads so
 * tests can cover every signal combination deterministically.
 */
export function devToolsVisibility(signals: DevToolsSignals = {}): boolean {
  return signals.buildFlag === true || signals.nativeFlag === true || signals.viteDev === true;
}

// Ambient declarations for the value injected by `define` in vite.config.ts.
// Declared globally so render sites (EnergyBar.tsx) can reference the flag
// inline — a literal `false` there lets release builds compile dev UI out.
declare global {
  const __LITTLEWINDS_DEV_TOOLS__: boolean;

  interface Window {
    /** Debug-only native override; release builds never set this. */
    __LITTLEWINDS_DEV_TOOLS__?: boolean;
  }
}

function buildFlag(): boolean {
  try {
    return __LITTLEWINDS_DEV_TOOLS__ === true;
  } catch {
    // Flag not injected by unexpected tooling -> release-safe default (off).
    return false;
  }
}

export function isDevToolsEnabled(): boolean {
  return devToolsVisibility({
    buildFlag: buildFlag(),
    nativeFlag: typeof window !== 'undefined' && window.__LITTLEWINDS_DEV_TOOLS__ === true,
    viteDev: import.meta.env.DEV,
  });
}
