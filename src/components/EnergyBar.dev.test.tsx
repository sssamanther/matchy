import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// DEV-ONLY (temporary): control the visibility gate deterministically.
vi.mock('../dev/devTools', () => ({ isDevToolsEnabled: vi.fn() }));

import { isDevToolsEnabled } from '../dev/devTools';
import EnergyBar from './EnergyBar';

const gate = vi.mocked(isDevToolsEnabled);

function render(onDevRefill?: () => void) {
  return renderToStaticMarkup(
    <EnergyBar energy={42} maxEnergy={100} energyUpdatedAt={Date.now()} onDevRefill={onDevRefill} />,
  );
}

afterEach(() => {
  gate.mockReset();
});

describe('DEV refill button visibility', () => {
  it('renders the DEV button next to the energy display when dev tools are enabled', () => {
    gate.mockReturnValue(true);
    const html = render(() => {});
    expect(html).toContain('DEV Refill');
    expect(html).toContain('data-testid="dev-refill-energy"');
  });

  it('hides the DEV button when the gate is off (release builds)', () => {
    gate.mockReturnValue(false);
    const html = render(() => {});
    expect(html).not.toContain('DEV Refill');
    expect(html).not.toContain('dev-refill-energy');
  });

  it('renders no DEV button without a handler even when the gate is on', () => {
    gate.mockReturnValue(true);
    const html = render(undefined);
    expect(html).not.toContain('DEV Refill');
    expect(html).not.toContain('dev-refill-energy');
  });

  it('still renders the normal energy display with the button present', () => {
    gate.mockReturnValue(true);
    const html = render(() => {});
    expect(html).toContain('Energy: 42 / 100');
  });
});
