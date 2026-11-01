import type { Board, ChainId, Order } from './types';

let nextOrderId = 1;
export function resetOrderIds(): void { nextOrderId = 1; }

export interface OrderContext {
  chains: ChainId[];
  completedOrders: number;
  plotIndex: number;
  existingOrders: Order[];
  board: Board;
}

// Plot-based minimum/maximum order tiers
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

// Configurable difficulty thresholds: completedOrders -> tier offset
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

// Reward table per tier (base per item)
const REWARD_TABLE: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 9,
};

export function rewardFor(order: Order): number {
  const base = REWARD_TABLE[order.tier] ?? order.tier;
  return base * order.count;
}

function getOrderQuantity(tier: number, completedOrders: number): number {
  // low tiers may request 2; higher tiers stay 1
  if (tier <= 2 && completedOrders % 3 === 0) return 2;
  return 1;
}

function chooseChain(chains: ChainId[], tier: number, existing: Order[]): ChainId {
  const available = chains.length ? chains : (['frog'] as ChainId[]);
  // avoid same chain+tier duplicate if possible
  const used = new Set(existing.map((o) => `${o.chain}:${o.tier}`));
  const candidates = available.filter((c) => !used.has(`${c}:${tier}`));
  const pool = candidates.length ? candidates : available;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateOrder(ctx: OrderContext): Order {
  const tier = getOrderTier(ctx.completedOrders, ctx.plotIndex);
  const chain = chooseChain(ctx.chains, tier, ctx.existingOrders);
  const count = getOrderQuantity(tier, ctx.completedOrders);
  return { id: nextOrderId++, chain, tier, count };
}

export function generateOrderSet(
  chains: ChainId[],
  plotIndex: number,
  completedOrders: number,
): Order[] {
  const range = plotTierRange(plotIndex);
  const min = range.min;
  const max = Math.min(range.max, 5); // cap at supported chain tier
  // difficulty mix: accessible, medium, challenging
  const tiers: number[] = [min];
  if (max > min) tiers.push(Math.min(min + 1, max));
  if (max > min + 1) tiers.push(max);
  // pad to 3
  while (tiers.length < 3) tiers.push(max);
  const out: Order[] = [];
  for (const tier of tiers) {
    const chain = chooseChain(chains, tier, out);
    const count = getOrderQuantity(tier, completedOrders);
    out.push({ id: nextOrderId++, chain, tier, count });
  }
  return out;
}

export function migrateOrders(orders: Order[], plotIndex: number, chains: ChainId[]): Order[] {
  const range = plotTierRange(plotIndex);
  const result: Order[] = [];
  for (const o of orders) {
    const isOutOfRange = o.tier < range.min || o.tier > range.max;
    const isDuplicate = result.some((r) => r.chain === o.chain && r.tier === o.tier && r.count === o.count);
    if (isOutOfRange || isDuplicate) {
      const replacement = generateOrder({
        chains,
        completedOrders: 0,
        plotIndex,
        existingOrders: result,
        board: [] as any,
      });
      // ensure tier within range
      replacement.tier = Math.max(range.min, Math.min(replacement.tier, range.max));
      result.push(replacement);
    } else {
      result.push(o);
    }
  }
  return result;
}

export function canFulfill(board: Board, order: Order): boolean {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && 'tier' in cell && cell.chain === order.chain && cell.tier === order.tier) n++;
  }
  return n >= order.count;
}