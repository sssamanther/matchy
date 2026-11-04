import { describe, expect, it } from 'vitest';

import { orderRequirementsKey, reconcileOrders, type OrderContext } from './orders';
import { createEmptyBoard } from './board';
import type { Order } from './types';

function req(chain: Order['requirements'][number]['chain'], tier: number, count = 1) {
  return { chain, tier, count };
}

const ctx: OrderContext = {
  chains: ['frog', 'flower'],
  completedOrders: 5,
  existingOrders: [],
  board: createEmptyBoard(),
  level: 3,
};

describe('normalized requirement-set comparison', () => {
  it('is independent of requirement order', () => {
    const a = [req('frog', 1), req('flower', 2, 2)];
    const b = [req('flower', 2, 2), req('frog', 1)];
    expect(orderRequirementsKey(a)).toBe(orderRequirementsKey(b));
  });

  it('separates differences in chain, tier and quantity', () => {
    expect(orderRequirementsKey([req('frog', 1)])).not.toBe(orderRequirementsKey([req('frog', 1, 2)]));
    expect(orderRequirementsKey([req('frog', 1)])).not.toBe(orderRequirementsKey([req('frog', 2)]));
    expect(orderRequirementsKey([req('frog', 1)])).not.toBe(orderRequirementsKey([req('flower', 1)]));
    expect(orderRequirementsKey([req('frog', 1), req('flower', 2)]))
      .not.toBe(orderRequirementsKey([req('frog', 1), req('mushroom', 2)]));
    // same multiset of requirements -> equal keys
    expect(orderRequirementsKey([req('frog', 1), req('frog', 1, 2), req('flower', 3)]))
      .toBe(orderRequirementsKey([req('flower', 3), req('frog', 1, 2), req('frog', 1)]));
  });
});

describe('reconcileOrders', () => {
  const frog3: Order = { id: 1, requirements: [req('frog', 3)] };
  const flower2: Order = { id: 2, requirements: [req('flower', 2, 2)] };

  it('returns the same array identity for already-unique order sets', () => {
    const clean = [frog3, flower2, { id: 3, requirements: [req('frog', 1, 2)] }];
    expect(reconcileOrders(clean, ctx)).toBe(clean);
  });

  it('replaces only duplicate requirement sets and preserves ids', () => {
    const dupA: Order = { id: 4, requirements: [req('frog', 3)] };
    const dupB: Order = { id: 5, requirements: [req('frog', 3)] };
    const mixed: Order = { id: 6, requirements: [req('flower', 1), req('frog', 2)] };
    const mixedReversed: Order = { id: 7, requirements: [req('frog', 2), req('flower', 1)] };

    const healed = reconcileOrders([frog3, dupA, dupB, mixed, mixedReversed], ctx);

    expect(healed).toHaveLength(5);
    expect(new Set(healed.map((o) => o.id)).size).toBe(5);
    const keys = healed.map((o) => orderRequirementsKey(o.requirements));
    expect(new Set(keys).size).toBe(5);
    // First occurrence of each set survives untouched.
    expect(healed[0]).toBe(frog3);
    expect(healed[3]).toBe(mixed);
    // Replacements never come from locked chains.
    const unlocked = new Set(ctx.chains);
    for (const o of healed) for (const r of o.requirements) expect(unlocked.has(r.chain)).toBe(true);
  });

  it('handles an empty order list', () => {
    expect(reconcileOrders([], ctx)).toEqual([]);
  });
});
