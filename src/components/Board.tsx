import { useRef } from 'react';
import Item from './Item';
import Generator from './Generator';
import { isGenerator } from '../game/types';
import type { Board as BoardType, Position } from '../game/types';

export default function Board({
  board,
  nudge,
  hint,
  onDrop,
  onGeneratorTap,
}: {
  board: BoardType;
  nudge: boolean;
  hint: { a: Position; b: Position } | null;
  onDrop: (from: Position, to: Position) => void;
  onGeneratorTap: (pos: Position) => void;
}) {
  const dragFrom = useRef<Position | null>(null);
  const dropHandled = useRef(false);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${board[0].length}, 1fr)`,
        gap: 6,
        padding: 8,
        background: '#e8f5e9',
        borderRadius: 12,
        transform: nudge ? 'translateX(4px)' : 'none',
        transition: 'transform 0.1s',
      }}
    >
      {board.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom.current && !dropHandled.current) {
                dropHandled.current = true;
                onDrop(dragFrom.current, { row: r, col: c });
                dragFrom.current = null;
              }
            }}
            style={{
              width: 56,
              height: 56,
              background:
                hint && ((hint.a.row === r && hint.a.col === c) || (hint.b.row === r && hint.b.col === c))
                  ? '#fff59d'
                  : '#fff',
              borderRadius: 8,
              border: '1px solid #c8e6c9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {cell ? (
              isGenerator(cell) ? (
                <Generator chain={cell.chain} onTap={() => onGeneratorTap({ row: r, col: c })} />
              ) : (
                <div
                  draggable
                  onDragStart={() => { dragFrom.current = { row: r, col: c }; dropHandled.current = false; }}
                >
                  <Item item={cell} />
                </div>
              )
            ) : null}
          </div>
        )),
      )}
    </div>
  );
}