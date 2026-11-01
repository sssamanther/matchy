import type { Board, ChainId, Order, OrderRequirement } from './types';

let nextOrderId = 1;
export function resetOrderIds(): void { nextOrderId = 1; }

export interface OrderContext {
  chains: ChainId[];
  completedOrders: number;
  plotIndex: number;
  existingOrders: Order[];
  board: Board;
}

export const PLOT_TIER_RANGE: Record<number, { min: number; max: number }> = {
  1: { min: 1, max: 3 },
  2: { min: 3, max: 4 },
  3: { min: 3, max: 5 },
  4: { min: 4, max: 5 },
  5: { min: 4, max: 6 },
};

export function plotTierRange(plotIndex: number): { min: number; max: number } {
  return PLOT_TIER_RANGE[plotIndex + 1] ?? { min: 1, max: 2 };
}

const TIER_THRESHOLDS: Array<{ min: number; tierOffset: number }> = [
  { min: 0, tierOffset: 0 },
  { min: 3, tierOffset: 1 },
  { min: 8, tierOffset: 2 },
];

export function getOrderTier(completedOrders: number, plotIndex: number): number {
  const range = plotTierRange(plotIndex);
  let offset = 0;
  for (const t of TIER_THRESHOLDS) {
    if (completedOrders >= t.min) offset = t.tierOffset;
  }
  const tier = Math.min(range.max, range.min + offset);
  return Math.max(range.min, Math.min(tier, 5));
}

const REWARD_TABLE: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 9,
};

export function rewardFor(order: Order): number {
  let total = 0;
  for (const r of order.requirements) {
    const base = REWARD_TABLE[r.tier] ?? r.tier;
    total += base * r.count;
  }
  return total;
}

function getOrderQuantity(tier: number, completedOrders: number): number {
  if (tier <= 2 && completedOrders % 3 === 0) return 2;
  return 1;
}

function chooseChain(chains: ChainId[], tier: number, existing: Order[]): ChainId {
  const available = chains.length ? chains : (['frog'] as ChainId[]);
  const used = new Set(existing.flatMap((o) => o.requirements.map((r) => `${r.chain}:${r.tier}`)));
  const candidates = available.filter((c) => !used.has(`${c}:${tier}`));
  const pool = candidates.length ? candidates : available;
  return pool[Math.floor(Math.random() * pool.length)];
}

function makeRequirement(chains: ChainId[], tier: number, existing: Order[]): OrderRequirement {
  const chain = chooseChain(chains, tier, existing);
  return { chain, tier, count: getOrderQuantity(tier, 0) };
}

export function generateOrder(ctx: OrderContext): Order {
  const tier = getOrderTier(ctx.completedOrders, ctx.plotIndex);
  const req = makeRequirement(ctx.chains, tier, ctx.existingOrders);
  return { id: nextOrderId++, requirements: [req] };
}

export function generateOrderSet(chains: ChainId[], plotIndex: number, completedOrders: number): Order[] {
  const range = plotTierRange(plotIndex);
  const min = range.min;
  const max = Math.min(range.max, 5);
  const tiers: number[] = [min];
  if (max > min) tiers.push(Math.min(min + 1, max));
  if (max > min + 1) tiers.push(max);
  while (tiers.length < 3) tiers.push(max);

  const out: Order[] = [];
  const seen = new Set<string>();

  const tryMake = (tier: number, attempts = 0): Order | null => {
    if (attempts > 10) return null;
    const reqs: OrderRequirement[] = [];
    const r1 = makeRequirement(chains, tier, out);
    reqs.push(r1);
    const multi = completedOrders >= 3 && Math.random() < 0.3;
    if (multi && chains.length > 1) {
      const t2 = Math.max(range.min, tier - 1);
      const r2 = makeRequirement(chains, t2, out);
      if (!(r2.chain === r1.chain && r2.tier === r1.tier)) reqs.push(r2);
    }
    const candidate: Order = { id: nextOrderId++, requirements: reqs };
    const key = candidate.requirements.map((r) => r.chain + ':' + r.tier + ':' + r.count).sort().join('|');
    if (seen.has(key)) return tryMake(tier, attempts + 1);
    seen.add(key);
    return candidate;
  };

  for (const tier of tiers) {
    let o = tryMake(tier);
    if (!o) o = tryMake(Math.min(max, tier + 1));
    if (o) out.push(o);
  }
  while (out.length < 3) {
    const o = tryMake(min);
    if (o) out.push(o);
    else break;
  }
  return out;
}

export function canFulfill(board: Board, order: Order): boolean {
  // check if all requirements can be met with current inventory (no double count across reqs? each req distinct type)
  for (const r of order.requirements) {
    let n = 0;
    for (const row of board) for (const cell of row) {
      if (cell && 'tier' in cell && cell.chain === r.chain && cell.tier === r.tier) n++;
    }
    if (n < r.count) return false;
  }
  return true;
}

export function countAvailable(board: Board, req: OrderRequirement): number {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && 'tier' in cell && cell.chain === req.chain && cell.tier === req.tier) n++;
  }
  return n;
}

export function migrateOrders(orders: Order[]): Order[] {
  // convert legacy single-item orders (if any) already in new format; ensure requirements
  return orders.map((o) => {
    if (o.requirements && Array.isArray(o.requirements)) return o;
    // legacy fallback
    const legacy = o as any;
    if (legacy.chain && legacy.tier) {
      return { id: nextOrderId++, requirements: [{ chain: legacy.chain, tier: legacy.tier, count: legacy.count ?? 1 }] };
    }
    return o;
  });
}