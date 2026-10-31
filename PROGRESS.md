# Matchy — Progress Update

Last updated: 2026-10-31

## Status: Playable core loop (Phase 1 + 2)

The game runs in the browser. Open `index.html` (or `npm run dev`) to play.

## What's implemented

- Merge-2 engine (`src/game/board.ts`): move, merge, merge-5 bonus, spawn, hints, no-deadlock helpers.
- Types, orders, plots (5), progress, storage modules.
- UI: plot select, board, sources, orders, garden level bar, plot-complete modal, sparkles.
- Idle hints (8s), ambient rain drops (10s), board-full nudge.
- localStorage progress persistence.
- Git repo initialized on `main` with commits.

## Commits

- b14aaa5 Initial commit: scaffold + merge-2 engine swap
- 8e0d695 Phase 2: plot select, garden level bar, idle hints, juice CSS
- b153fd6 Add PlotComplete modal
- 804a2e4 Persist progress to localStorage
- ca342c6 Add sparkle burst on merge

## How to run

```
npm run dev      # dev server
npm run build    # typecheck + production build
npm test         # vitest (10 tests)
```

## Remaining / future work

- Tier-up pop animations wired to specific cells
- Sound/music (out of v1 scope)
- Real art replacing emoji placeholders
- Story/dialogue, coins/selling (post-v1)
- Seasonal events
- More tests for orders/plots/progress

## Known notes

- `core.autocrlf=false` set globally; files use LF.
- Opening `index.html` directly works for a quick preview; use `npm run dev` for HMR.