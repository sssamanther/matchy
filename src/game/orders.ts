import type { ChainId, Order } from './types';

let nextOrderId = 1;
export function resetOrderIds(): void { nextOrderId = 1; }

/** Generate a simple order. Weighted tuning deferred to playtest. */
export function generateOrder(chain: ChainId = 'frog', tier: number = 1, count: number = 1): Order {
  return { id: nextOrderId++, chain, tier, count };
}

/** Check if board has enough items to fulfill an order. */
export function canFulfill(board: import('./types').Board, order: Order): boolean {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && cell.chain === order.chain && cell.tier === order.tier) n++;
  }
  return n >= order.count;
}