import type { Board, ChainId, Order } from './types';

let nextOrderId = 1;
export function resetOrderIds(): void { nextOrderId = 1; }

export interface OrderContext {
  chains: ChainId[];
  completedOrders: number;
  existingOrders: Order[];
  board: Board;
}

// Configurable difficulty thresholds: completedOrders -> tier
const TIER_THRESHOLDS: Array<{ min: number; tier: number }> = [
  { min: 0, tier: 1 },
  { min: 3, tier: 2 },
  { min: 6, tier: 3 },
  { min: 10, tier: 4 },
  { min: 16, tier: 5 },
];

export function getOrderTier(completedOrders: number): number {
  let tier = 1;
  for (const t of TIER_THRESHOLDS) {
    if (completedOrders >= t.min) tier = t.tier;
  }
  return Math.min(tier, 5);
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
  const tier = getOrderTier(ctx.completedOrders);
  const chain = chooseChain(ctx.chains, tier, ctx.existingOrders);
  const count = getOrderQuantity(tier, ctx.completedOrders);
  return { id: nextOrderId++, chain, tier, count };
}

export function canFulfill(board: Board, order: Order): boolean {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && 'tier' in cell && cell.chain === order.chain && cell.tier === order.tier) n++;
  }
  return n >= order.count;
}