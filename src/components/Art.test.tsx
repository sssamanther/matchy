// @vitest-environment jsdom
/**
 * Art component tests — illustration rendering, emoji fallback when no
 * artwork exists, and graceful fallback when an image fails to load.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

// React requires this flag for act()-based updates outside of a test renderer.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import Art from './Art';

describe('Art rendering (static markup)', () => {
  it('renders the illustration with alt text and object-fit contain', () => {
    const html = renderToStaticMarkup(
      <Art src="/assets/items/flower-1-seed.png" alt="Seed" emoji="🌸" style={{ width: 16, height: 16 }} />,
    );
    expect(html).toContain('src="/assets/items/flower-1-seed.png"');
    expect(html).toContain('alt="Seed"');
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('width:16px');
    expect(html).not.toContain('role="img"'); // no emoji fallback in the happy path
  });

  it('renders the emoji fallback with an accessible label when no artwork exists', () => {
    const html = renderToStaticMarkup(<Art src={null} alt="tadpole" emoji="🐸" />);
    expect(html).not.toContain('<img');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="tadpole"');
    expect(html).toContain('🐸');
  });
});

describe('Art runtime behavior (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  async function mount(node: ReactElement): Promise<HTMLDivElement> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(node);
    });
    return container;
  }

  afterEach(async () => {
    if (root) {
      const r = root;
      await act(async () => r.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('keeps the illustration while it loads', async () => {
    const c = await mount(<Art src="/assets/items/flower-2-sprout.png" alt="Sprout" emoji="🌸" />);
    expect(c.querySelector('img')).not.toBeNull();
    expect(c.querySelector('img')!.getAttribute('src')).toBe('/assets/items/flower-2-sprout.png');
  });

  it('falls back to the emoji when the image fails to load', async () => {
    const c = await mount(<Art src="/assets/items/flower-2-sprout.png" alt="Sprout" emoji="🌸" />);
    const img = c.querySelector('img');
    expect(img).not.toBeNull();

    await act(async () => {
      img!.dispatchEvent(new Event('error'));
    });

    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toBe('🌸');
    const fallback = c.querySelector('[role="img"]');
    expect(fallback).not.toBeNull();
    expect(fallback!.getAttribute('aria-label')).toBe('Sprout');
  });

  it('starts on the emoji fallback when src is null (chain without artwork)', async () => {
    const c = await mount(<Art src={null} alt="froglet" emoji="🐸" />);
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toBe('🐸');
  });
});
