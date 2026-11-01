import { afterEach, describe, expect, it, vi } from 'vitest';
import { devToolsVisibility, isDevToolsEnabled } from './devTools';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('dev tools visibility gate (pure logic)', () => {
  it('is off by default — release-safe default', () => {
    expect(devToolsVisibility()).toBe(false);
  });

  it('is off when every signal is explicitly false', () => {
    expect(devToolsVisibility({ buildFlag: false, nativeFlag: false, viteDev: false })).toBe(false);
  });

  it('is on with the build-time flag only (Android debug builds)', () => {
    expect(devToolsVisibility({ buildFlag: true })).toBe(true);
  });

  it('is on with the native debug override only', () => {
    expect(devToolsVisibility({ nativeFlag: true })).toBe(true);
  });

  it('is on with the vite dev-server flag only', () => {
    expect(devToolsVisibility({ viteDev: true })).toBe(true);
  });
});

describe('isDevToolsEnabled (environment integration)', () => {
  it('honours the native debug override', () => {
    vi.stubGlobal('window', { __LITTLEWINDS_DEV_TOOLS__: true });
    expect(isDevToolsEnabled()).toBe(true);
  });

  it('stays off with no debug signals present', () => {
    // Simulate a release build: no build flag, no native override, and
    // `import.meta.env.DEV` stubbed to false (a `vite build` always bakes false).
    vi.stubGlobal('window', {});
    vi.stubEnv('DEV', false);
    expect(isDevToolsEnabled()).toBe(false);
  });

  it('ignores a native override that is not exactly true', () => {
    vi.stubGlobal('window', { __LITTLEWINDS_DEV_TOOLS__: 'yes' });
    vi.stubEnv('DEV', false);
    expect(isDevToolsEnabled()).toBe(false);
  });
});
