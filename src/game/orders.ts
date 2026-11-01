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
  1: { min: 1, max: 2 },
  2: { min: 2, max: 3 },
  3: { min: 2, max: 4 },
  4: { min: 3, max: 4 },
  5: { min: 3, max: 5 },
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

export function migrateOrders(orders: Order[], plotIndex: number, chains: ChainId[]): Order[] {
  const range = plotTierRange(plotIndex);
  return orders.map((o) => {
    if (o.tier >= range.min && o.tier <= range.max) return o;
    // upgrade (or clamp) to minimum tier
    const existing = orders.filter((x) => x.id !== o.id);
    const tier = range.min;
    const chain = chooseChain(chains, tier, existing);
    return { id: nextOrderId++, chain, tier, count: o.count };
  });
}

export function canFulfill(board: Board, order: Order): boolean {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && 'tier' in cell && cell.chain === order.chain && cell.tier === order.tier) n++;
  }
  return n >= order.count;
}