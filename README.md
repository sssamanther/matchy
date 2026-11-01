# Little Winds: A Cozy Merge Story

**Tagline:** Every garden deserves a second chance.

A cozy, story-driven merge-2 garden restoration game.

## Game concept

After a powerful windstorm damages a beloved countryside property, the player returns to restore its gardens, greenhouse, pathways, pond, and cottage surroundings.

The game has a realistic, warm, botanical atmosphere rather than a magical or fantasy setting.

## Core gameplay direction

- One persistent merge board rather than separate boards for each plot.
- Generators can eventually be repositioned on the board.
- Tapping generators creates items and consumes energy.
- Merging two matching items produces a higher-tier item.
- Completing orders earns XP and coins.
- XP increases the player's level and unlocks new content.
- Coins are used for garden restoration tasks.
- A separate garden screen shows restoration progress and story developments.
- The game will eventually include inventory storage, additional item chains, characters, and seasonal story content.

## Future weed obstacle mechanic (not implemented)

We plan to introduce weed-covered board squares later in development.

Weeds are cleared primarily by successful merges beside them. Moving items next to weeds does not damage or clear them.

Special orders may occasionally reward weed-clearing tools.

This mechanic is documented as a future feature only.

## Story and branding

- Game title: Little Winds: A Cozy Merge Story
- Tagline: Every garden deserves a second chance.
- Setting: A countryside cottage and garden damaged by a severe windstorm.
- Tone: Cozy, gentle, realistic, nostalgic, welcoming.

## Development

```bash
npm run dev
npm run build
npm test
```

## Mobile input audit (planning only)

Current board interactions rely on native HTML drag-and-drop in `src/components/Board.tsx` (draggable items + cell onDrop). Generators use click/tap buttons.

To migrate to Pointer Events for Capacitor/Android/iOS:

1. Replace draggable wrappers with pointer handlers: `onPointerDown`, `onPointerMove`, `onPointerUp`.
2. Track a drag state (`dragging: {from, pointerId, startX, startY}`) and a threshold to distinguish tap vs drag.
3. On pointer down on an item, record origin; on move beyond threshold, enter drag mode and show a floating preview.
4. On pointer up, resolve target cell by hit-testing (elementFromPoint or cell refs); if same origin and no movement, treat as tap (for generators) or no-op; otherwise attempt merge/move.
5. For generators, keep click/tap but also support pointer tap.
6. Prevent duplicate actions by guarding with a per-gesture flag and clearing on pointer up/cancel.
7. Add `touch-action: none` on the board to avoid browser gestures.
8. Keep merge logic unchanged (state reducer).

Risks: hit-testing accuracy, scroll/gesture conflicts, accessibility, multi-touch. Decide on tap threshold and whether to support keyboard. No Capacitor install yet.