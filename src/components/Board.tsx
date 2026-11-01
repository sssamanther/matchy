import { useRef, useState } from 'react';
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
  const [hover, setHover] = useState<Position | null>(null);

  const clearDrag = () => {
    dragFrom.current = null;
    setHover(null);
  };

  const cellAt = (x: number, y: number): Position | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const cell = el.closest('[data-row]') as HTMLElement | null;
    if (!cell) return null;
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return null;
    return { row: r, col: c };
  };

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
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {board.map((row, r) =>
        row.map((cell, c) => {
          const isHover = !!hover && hover.row === r && hover.col === c;
          return (
            <div
              key={`${r}-${c}`}
              data-row={r}
              data-col={c}
              style={{
                width: 56,
                height: 56,
                background:
                  isHover
                    ? '#c8e6c9'
                    : hint && ((hint.a.row === r && hint.a.col === c) || (hint.b.row === r && hint.b.col === c))
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
                    style={{ width: '100%', height: '100%', cursor: 'grab' }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      dragFrom.current = { row: r, col: c };
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!dragFrom.current) return;
                      const target = cellAt(e.clientX, e.clientY);
                      setHover(target);
                    }}
                    onPointerUp={(e) => {
                      if (!dragFrom.current) { clearDrag(); return; }
                      const target = cellAt(e.clientX, e.clientY) ?? hover;
                      if (target && !(target.row === dragFrom.current.row && target.col === dragFrom.current.col)) {
                        onDrop(dragFrom.current, target);
                      }
                      clearDrag();
                    }}
                    onPointerCancel={() => clearDrag()}
                  >
                    <Item item={cell} />
                  </div>
                )
              ) : null}
            </div>
          );
        }),
      )}
    </div>
  );
}