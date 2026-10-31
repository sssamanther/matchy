# Matchy — Game Plan (v2: MERGE GAME)

> Living design doc. Reference this anytime to remember what we decided and what's left.
> v1 of this doc described a match-3; the game pivoted to a **Gossip Harbor-style merge-2** game during planning.

## 🐸 Concept

A **cozy garden merge game** for the browser. Drag an item **onto its identical twin** → they fuse into the next tier of the chain. Climb each chain to its master form, serve customer orders, and grow your star collection. No timers, no fail states — pure cozy progression.

**Inspiration:** Gossip Harbor (merge-2 genre) — generators, merge chains, customer orders — reskinned into a little garden world with themed sources.

**Core loop:** spawn items → merge up the chains → serve orders → earn ⭐ → complete the plot → unlock the next.

## ✅ Locked-in Decisions

| Area | Decision |
|---|---|
| Genre | Merge-2 (drag item onto identical item → next tier) |
| Board | **7×7** (49 cells), **4 fixed source tiles live on the board** |
| Sources | **Tap-to-spawn + ambient drops**: tap sources spawn tier-1 items; the rain cloud also drips a seed onto the board every ~10s |
| Win condition | **Customer orders** — 3 visible order slots, completed order → celebration + new order slides in |
| Level structure | **5 hand-made plots** — each is a fresh garden layout with fixed sources; beat it to unlock the next |
| Star economy | **Two layers**: (1) each order = 1 ⭐; a plot needs a star quota to finish — **1, 5, 10, 15, 20** orders for plots 1–5; (2) lifetime stars fill a global **Garden Level** bar (cosmetic milestones/titles in v1) |
| Merge rules | Free drag anywhere (rearrange freely); **merge-5 bonus**; unlimited source taps |
| Fail state | **None** — no timer, no moves limit, no lives |
| Chains | **4 garden chains, ~5 tiers each** (see below) |
| Art | Emoji placeholders — real art drops in later |
| Juice (in) | Bouncy animations, sparkle bursts, juicy tier-up pops, order-served celebration, idle hints (pulse a mergeable pair after ~8s) |
| Juice (out of v1) | Sound/music, selling/coins, story/dialogue, real art |
| Tech | React + Vite + TypeScript, `localStorage` progress |
| Old match-3 code | Reuse the shell, **swap the guts** when building starts (engine/tests/UI get replaced) |

## 🌿 The Four Chains (4–6 tiers, exact emojis tunable at build)

| Chain | Source | Tiers (proposal) |
|---|---|---|
| 🐸 Frog | 🌊 Pond | tadpole → big tadpole → froglet → frog → **Frog Prince** 👑 |
| 🌸 Flower | 🌧️ Rain cloud | seed → sprout → bud → bloom → **Grand Bloom** |
| 🍄 Mushroom | 🪵 Log/stump | spore → button → shroom → cap → **Glowing Shroom** |
| 🫐 Berry | 🫐 Berry bush | sprig → blossom → green berry → ripe berry → **Berry Basket** |

Chain depth ≈ 5 tiers (1 base item per merge step: 2 → 4 → 8 → 16 → 32 to craft one master from scratch).

## 📐 Game Rules

- **Merging:** drag item A onto identical item B → both consumed → next-tier item appears at B's cell. Tier-up gets a bigger celebratory pop.
- **Merge-5 bonus:** when the merged group involves ≥5 matching items, award **2 next-tier items + bonus sparkle** instead of 1. Exact group semantics (connected-cluster vs stack) decided & tuned at build time.
- **Rearrange:** any item can be dragged onto any empty cell — board Tetris is half the strategy.
- **Sources:** tapping spawns its chain's tier-1 into an adjacent/random empty cell; if the board is full → gentle wiggle + "board full" nudge. Rain cloud additionally auto-drops every ~10s when space allows.
- **Orders:** 3 slots; each order requests a specific chain item (tiers/quantities weighted by plot & player progress) → tapping a fulfillable order serves it: pop, ⭐ +1, replacement order slides in.
- **Plot complete:** stars ≥ plot quota → completion modal → next plot unlocks.

## 🛡️ No-Deadlock Guarantee (carried over from the dead-board concern)

- **Pigeonhole safety:** ~20 item types (4 chains × 5 tiers) vs 49 cells — a full board *always* contains at least one duplicate pair, so **a stuck board is mathematically impossible**.
- Board can still get *crowded* (that's the fun juggling) but never unplayable.
- Idle hint after ~8s pulses any mergeable pair — the player is never left staring.

## 📋 Architecture

```
src/
  game/
    types.ts     — Item {chain, tier}, Board, Source, Order, Plot, Progress
    board.ts     — grid ops: move/spawn/empties, hasMergePair (no-deadlock), rearrange
    merge.ts     — mergeAt(board, from, to): consumed cells, results, merge-5 logic
    orders.ts    — order generation (weighted), fulfillability check, serve
    plots.ts     — 5 hand-made plot layouts (source positions, starting items, quotas)
    progress.ts  — star quotas [1,5,10,15,20], Garden Level thresholds, localStorage
  hooks/useGame.ts   — state machine, cascade/pop timing, ambient rain timer, idle hints
  components/
    Board.tsx / Item.tsx / Source.tsx   — absolute positioning, transform transitions
    OrderPanel.tsx, GardenLevelBar.tsx, PlotSelect.tsx, PlotComplete.tsx, Sparkles.tsx
  storage.ts
  App.tsx        — screens: Plot Select ↔ Plot ↔ Completion modal
```

**Engine stays pure & unit-tested** (like the match-3 was): `mergeAt`, `hasMergePair`, order generation — all testable without React. Old `board.test.ts` (match-3) gets replaced with merge-engine tests.

## 📋 Status

- [x] Design planning complete (this doc)
- [x] Vite + React + TS shell scaffolded, deps installed
- [ ] **Swap guts** — remove match-3 engine/tests/UI, keep shell
- [ ] Merge engine (pure functions) + no-deadlock tests
- [ ] Drag & drop input, merge pops, tier-up celebrations
- [ ] Sources (tap + rain ambient) & board-space nudges
- [ ] Orders panel (3 slots), stars, plot quotas
- [ ] 5 hand-made plots + plot select + completion modals
- [ ] Global Garden Level bar (lifetime stars, titles)
- [ ] Juice: bouncy animations, sparkles, idle hints
- [ ] Playtest & tune: order weights, quotas, merge-5 semantics

## 🔮 Future (post-v1)

- Coins + selling items for space
- Story/dialogue characters (Gossip Harbor flavor)
- Real art replacing emoji placeholders
- Sound & music
- Seasonal events / limited generators
