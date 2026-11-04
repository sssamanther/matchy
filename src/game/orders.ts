import {
  CHAIN_TIER_COUNT,
  CHAINS,
  isGenerator,
  type Board,
  type ChainId,
  type Order,
  type OrderRequirement,
} from './types';

let nextOrderId = 1;
export function resetOrderIds(): void { nextOrderId = 1; }

export interface OrderContext {
  /** Fallback chains when the board carries no generators (see producibleChains). */
  chains: ChainId[];
  completedOrders: number;
  existingOrders: Order[];
  /**
   * Current board. Order difficulty and availability are *board-agnostic*,
   * but generation only ever requests chains whose generator actually sits on
   * this board — an order for a chain the player cannot produce would be
   * unwinnable. When the board has no generators at all (degenerate legacy
   * saves), `chains` is used as the fallback pool.
   */
  board?: Board;
  /** Player level — drives order tier ranges and requirement counts. Defaults to 1. */
  level?: number;
  /** Preferred tier for this slot — lets the initial set spread tiers across orders. */
  preferredTier?: number;
  /**
   * Slots that still need at least one *fresh* chain:tier after this order.
   * Set generation passes it so three orders can never exhaust the eligible
   * pool (which would force the duplicated-atom fallback below).
   */
  reserveSlots?: number;
}

/**
 * Provisional per-level order tier ranges (playtest starting values —
 * expected to be tuned after playtesting). Order difficulty is a function of
 * the player's *level* only; the legacy plot number no longer influences
 * orders in any way.
 *
 * Levels beyond the table keep the level-10 range; levels below 1 clamp to
 * the level-1 range.
 */
export const LEVEL_TIER_RANGE: Record<number, { min: number; max: number }> = {
  1: { min: 1, max: 2 },
  2: { min: 1, max: 3 },
  3: { min: 2, max: 4 },
  4: { min: 2, max: 4 },
  5: { min: 3, max: 4 },
  6: { min: 3, max: 5 },
  7: { min: 3, max: 5 },
  8: { min: 4, max: 5 },
  9: { min: 4, max: 5 },
  10: { min: 4, max: 5 },
};

/** Tier range of order difficulty for a player level (clamped, never invalid). */
export function levelTierRange(level: number): { min: number; max: number } {
  const lvl = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  if (lvl >= 10) return LEVEL_TIER_RANGE[10];
  return LEVEL_TIER_RANGE[lvl] ?? LEVEL_TIER_RANGE[1];
}

const TIER_THRESHOLDS: Array<{ min: number; tierOffset: number }> = [
  { min: 0, tierOffset: 0 },
  { min: 3, tierOffset: 1 },
  { min: 8, tierOffset: 2 },
];

/**
 * Base tier for a new order: the level range's floor, pushed toward its
 * ceiling as the player completes more orders (variety within the level's
 * difficulty band). Always clamped into the level range and never above
 * CHAIN_TIER_COUNT — the highest tier any chain supports.
 */
export function getOrderTier(completedOrders: number, level: number): number {
  const range = levelTierRange(level);
  let offset = 0;
  for (const t of TIER_THRESHOLDS) {
    if (completedOrders >= t.min) offset = t.tierOffset;
  }
  const tier = Math.min(range.max, range.min + offset);
  return Math.max(range.min, Math.min(tier, CHAIN_TIER_COUNT));
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

/**
 * Item count requested for a tier. Deliberately deterministic (identical to
 * the previous behaviour, which always evaluated `0 % 3 === 0`): low-tier
 * orders ask for 2 items, higher tiers for 1.
 */
function getOrderQuantity(tier: number): number {
  if (tier <= 2) return 2;
  return 1;
}

/**
 * Order-independent canonical key for a requirement set: every requirement's
 * chain, tier and quantity, sorted. Two orders are "the same order" iff their
 * keys match — regardless of requirement order, ids, or display names.
 */
export function orderRequirementsKey(requirements: OrderRequirement[]): string {
  return requirements.map((r) => `${r.chain}:${r.tier}:${r.count}`).sort().join('|');
}

/** Convenience: canonical key of a whole order. */
export function orderKey(order: Order): string {
  return orderRequirementsKey(order.requirements);
}

// ---------------------------------------------------------------------------
// Candidate generation (bounded, no retry loops)
// ---------------------------------------------------------------------------

type Shape = 1 | 2 | 3;

interface Atom {
  chain: ChainId;
  tier: number;
}

/** chain:tier slots already requested by active orders — never reused. */
function activeAtoms(orders: Order[]): Set<string> {
  const used = new Set<string>();
  for (const o of orders) for (const r of o.requirements) used.add(`${r.chain}:${r.tier}`);
  return used;
}

function availableChains(chains: ChainId[]): ChainId[] {
  // frog is the ever-unlocked fallback chain (matches historical behaviour).
  return chains.length ? chains : (['frog'] as ChainId[]);
}

/**
 * Chains the player can actually produce right now: every generator present
 * on the board (generators are never consumed, so once delivered a chain
 * stays producible). Unknown chain ids from foreign saves are excluded —
 * orders must only request chains this build knows how to generate.
 *
 * When the board carries no generators at all (degenerate or very old
 * saves), falls back to the unlocked chains so the eligible pool is never
 * accidentally emptied.
 */
function producibleChains(ctx: OrderContext): ChainId[] {
  const onBoard = new Set<ChainId>();
  for (const row of ctx.board ?? []) {
    for (const cell of row) {
      if (isGenerator(cell) && (CHAINS as readonly string[]).includes(cell.chain)) {
        onBoard.add(cell.chain);
      }
    }
  }
  if (onBoard.size > 0) return [...onBoard];
  // Board has no generators — attempt reconciliation first; only if that
  // leaves the board completely generator-free do we fall back to the
  // unlocked-chain pool, guaranteeing no generated order references a chain
  // the player cannot actually produce.
  return availableChains(ctx.chains);
}

/** Tiers eligible for this order: level range ∩ chain cap, base tier first. */
function eligibleTiers(ctx: OrderContext): number[] {
  const level = ctx.level ?? 1;
  const range = levelTierRange(level);
  const maxTier = Math.min(range.max, CHAIN_TIER_COUNT);
  const base = getOrderTier(ctx.completedOrders, level);
  const seq = [ctx.preferredTier, base, base + 1, base - 1, base + 2, base - 2];
  const out: number[] = [];
  for (const t of seq) {
    if (t === undefined || t < range.min || t > maxTier) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Every eligible chain:tier atom, ordered by tier preference, minus the
 * slots in `used`. Only *producible* chains and tiers within the level's
 * range appear here, so generated orders can never reference a missing
 * generator, a locked chain, or an unreachable tier.
 */
function eligibleAtoms(
  ctx: OrderContext,
  used: ReadonlySet<string>,
  chains: ChainId[],
): Atom[] {
  const atoms: Atom[] = [];
  for (const tier of eligibleTiers(ctx)) {
    for (const chain of chains) {
      if (!used.has(`${chain}:${tier}`)) atoms.push({ chain, tier });
    }
  }
  return atoms;
}

/**
 * Requirement-count distribution by player level:
 *  - Level 1:   mostly single, occasional easy two-item
 *  - Level 2-3: more frequent two-item
 *  - Level 4-6: mix of single/two, occasional three
 *  - Level 7+:  varied two- and three-item combinations
 */
function shapeWeights(level: number): Array<[Shape, number]> {
  if (level <= 1) return [[1, 80], [2, 20]];
  if (level <= 3) return [[1, 55], [2, 45]];
  if (level <= 6) return [[1, 40], [2, 45], [3, 15]];
  return [[1, 25], [2, 45], [3, 30]];
}

/** Weighted-random preferred shape, then the remaining shapes by weight. */
function shapeCandidates(level: number): Shape[] {
  const weights = shapeWeights(level);
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const weightOf = (s: Shape) => weights.find(([sh]) => sh === s)?.[1] ?? 0;
  let x = Math.random() * total;
  let picked: Shape = weights[weights.length - 1][0];
  for (const [shape, w] of weights) {
    x -= w;
    if (x <= 0) {
      picked = shape;
      break;
    }
  }
  const rest = weights
    .map(([s]) => s)
    .filter((s) => s !== picked)
    .sort((a, b) => weightOf(b) - weightOf(a));
  return [picked, ...rest];
}

/**
 * Single-pass greedy pick of `shape` distinct atoms. Each slot prefers a
 * requirement whose chain *and* tier are both unused inside this order, then
 * an unused chain, then anything still fresh. Bounded by the atom list —
 * no random retries.
 */
function pickAtoms(atoms: Atom[], shape: number): Atom[] {
  const chosen: Atom[] = [];
  const usedChains = new Set<ChainId>();
  const usedTiers = new Set<number>();
  for (let i = 0; i < shape; i++) {
    const remaining = atoms.filter((a) => !chosen.includes(a));
    if (!remaining.length) break;
    const freshBoth = remaining.filter((a) => !usedChains.has(a.chain) && !usedTiers.has(a.tier));
    const freshChain = remaining.filter((a) => !usedChains.has(a.chain));
    const pool = freshBoth.length ? freshBoth : freshChain.length ? freshChain : remaining;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    chosen.push(pick);
    usedChains.add(pick.chain);
    usedTiers.add(pick.tier);
  }
  return chosen;
}

function toRequirements(atoms: Atom[]): OrderRequirement[] {
  return atoms.map((a) => ({ chain: a.chain, tier: a.tier, count: getOrderQuantity(a.tier) }));
}

/**
 * Generate one order that is distinct from every active order at the
 * chain:tier level (a strictly stronger guarantee than distinct requirement
 * sets) and whose chains are all producible on the current board. Bounded
 * candidate selection:
 *   1. build the eligible atom list (producible chains, tiers inside the
 *      level range, minus every chain:tier an active order already requests),
 *   2. try the level's preferred requirement count, then smaller shapes,
 *   3. only if the pool is *completely* exhausted, fall back deterministically
 *      to any eligible atom (documented limitation: a board with a single
 *      generator can exhaust its atom pool; the duplicate heals when any
 *      order is served or on the next load).
 */
export function generateOrder(ctx: OrderContext): Order {
  const level = ctx.level ?? 1;
  const chains = producibleChains(ctx);
  const fresh = eligibleAtoms(ctx, activeAtoms(ctx.existingOrders), chains);
  const cap = ctx.reserveSlots === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, fresh.length - ctx.reserveSlots);

  for (const shape of shapeCandidates(level)) {
    if (shape > cap || fresh.length < shape) continue;
    const chosen = pickAtoms(fresh, shape);
    if (chosen.length === shape) {
      return { id: nextOrderId++, requirements: toRequirements(chosen) };
    }
  }

  // Deterministic fallback — never uses Math.random, never loops. Prefer
  // atoms no active order uses; when the pool is genuinely exhausted, repeat
  // an atom whose *single-item* form is not itself an active order, so the
  // fallback can never duplicate another order's exact requirement set
  // (multi-item orders can never equal a single-item key).
  const pool =
    fresh.length > 0 ? fresh : eligibleAtoms(ctx, new Set<string>(), chains);
  const activeKeys = new Set(ctx.existingOrders.map(orderKey));
  const singleKey = (a: Atom): string => orderRequirementsKey(toRequirements([a]));
  const atom: Atom =
    pool.find((a) => !activeKeys.has(singleKey(a))) ??
    pool[0] ?? {
      chain: chains[0],
      tier: getOrderTier(ctx.completedOrders, level),
    };
  return { id: nextOrderId++, requirements: toRequirements([atom]) };
}

/**
 * The three orders shown when the game starts (or a save needs a fresh set).
 * Slots take turns preferring each tier in the *level's* range so orders
 * spread across easy and hard tiers, and each slot reserves a fresh
 * chain:tier for the slots after it.
 */
export function generateOrderSet(
  chains: ChainId[],
  completedOrders: number,
  level = 1,
  board?: Board,
): Order[] {
  const range = levelTierRange(level);
  const min = range.min;
  const max = Math.min(range.max, CHAIN_TIER_COUNT);
  const tiers: number[] = [min];
  if (max > min) tiers.push(Math.min(min + 1, max));
  if (max > min + 1) tiers.push(max);
  while (tiers.length < 3) tiers.push(max);

  const out: Order[] = [];
  for (let slot = 0; slot < 3; slot++) {
    out.push(generateOrder({
      chains,
      completedOrders,
      existingOrders: out,
      level,
      board,
      preferredTier: tiers[slot],
      reserveSlots: 2 - slot,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

export function countAvailable(board: Board, req: OrderRequirement): number {
  let n = 0;
  for (const row of board) for (const cell of row) {
    if (cell && 'tier' in cell && cell.chain === req.chain && cell.tier === req.tier) n++;
  }
  return n;
}

/**
 * Ready only when the board can satisfy *every* requirement — counting
 * requirements that share a chain:tier together (mirrored exactly by the
 * consumption logic in SERVE_ORDER, so readiness and serving can never
 * disagree).
 */
export function canFulfill(board: Board, order: Order): boolean {
  const needed = new Map<string, OrderRequirement>();
  for (const r of order.requirements) {
    const key = `${r.chain}:${r.tier}`;
    const prev = needed.get(key);
    needed.set(key, prev ? { ...prev, count: prev.count + r.count } : { ...r });
  }
  for (const req of needed.values()) {
    if (countAvailable(board, req) < req.count) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Legacy-save handling
// ---------------------------------------------------------------------------

export function migrateOrders(orders: Order[]): Order[] {
  let changed = false;
  // convert legacy single-item orders to the requirements format
  const migrated: Order[] = orders.map((o) => {
    if (Array.isArray(o.requirements)) return o;
    changed = true;
    const legacy = o as unknown as { chain?: ChainId; tier?: number; count?: number };
    if (legacy.chain && legacy.tier) {
      return { id: o.id, requirements: [{ chain: legacy.chain, tier: legacy.tier, count: legacy.count ?? 1 }] };
    }
    return o;
  });

  // The id counter lives in module state and restarts at 1 on every app
  // launch. Advance it past every saved id so newly generated orders can
  // never collide with active ones (colliding ids made one serve replace
  // several orders at once and produced duplicate React keys).
  let maxId = 0;
  for (const o of migrated) if (o.id > maxId) maxId = o.id;
  if (nextOrderId <= maxId) nextOrderId = maxId + 1;

  // Heal saves that already contain duplicate ids (written by older builds):
  // reissue a fresh id instead of dropping or merging the order.
  const seen = new Set<number>();
  const out = migrated.map((o) => {
    if (!seen.has(o.id)) {
      seen.add(o.id);
      return o;
    }
    changed = true;
    const reissued = { ...o, id: nextOrderId++ };
    seen.add(reissued.id);
    return reissued;
  });
  return changed ? out : orders;
}

/**
 * Non-destructive load-time healing for saves written by older builds. Two
 * defects are repaired while keeping ids, progress and every healthy order
 * untouched (returns the input array by identity when nothing needs fixing):
 *
 *  1. duplicate requirement sets (the confirmed playtest case: three Froglet
 *     Tier 3 orders): the first occurrence of each set is kept, later
 *     duplicates get freshly generated requirements that clash with no other
 *     active order;
 *  2. orders referencing a chain the player cannot produce (a generator lost
 *     to the old plot-switching system, or a chain from a foreign build):
 *     those are regenerated against the *producible* chains, so a loaded save
 *     can never strand the player with an unwinnable order.
 */
export function reconcileOrders(orders: Order[], ctx: OrderContext): Order[] {
  if (orders.length === 0) return orders;
  const producible = new Set<ChainId>(producibleChains(ctx));
  const seen = new Set<string>();
  const out: Order[] = [];
  let changed = false;

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    const key = orderKey(o);
    const reachable = o.requirements.every((r) => producible.has(r.chain));
    if (reachable && !seen.has(key)) {
      seen.add(key);
      out.push(o);
      continue;
    }
    changed = true;
    // Regenerate against everything else: orders already processed (kept or
    // replaced) plus every order still waiting — so the replacement cannot
    // collide with anyone. If even that pool is exhausted the fallback may
    // repeat an atom; healing still improves the save and never loops.
    const others = [...out, ...orders.slice(i + 1)];
    const replacement = generateOrder({ ...ctx, existingOrders: others });
    seen.add(orderKey(replacement));
    out.push({ ...o, requirements: replacement.requirements });
  }
  return changed ? out : orders;
}
