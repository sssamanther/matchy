import { useRef } from 'react';
import Item from './Item';
import type { Board as BoardType, Position } from '../game/types';

export default function Board({
  board,
  nudge,
  hint,
  onDrop,
}: {
  board: BoardType;
  nudge: boolean;
  hint: { a: Position; b: Position } | null;
  onDrop: (from: Position, to: Position) => void;
}) {
  const dragFrom = useRef<Position | null>(null);

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
              if (dragFrom.current) {
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
              <div
                draggable
                onDragStart={() => { dragFrom.current = { row: r, col: c }; }}
              >
                <Item item={cell} />
              </div>
            ) : null}
          </div>
        )),
      )}
    </div>
  );
}