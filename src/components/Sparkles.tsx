import { useEffect, useState } from 'react';

export default function Sparkles({ pos }: { pos: { row: number; col: number } | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!pos) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 600);
    return () => clearTimeout(t);
  }, [pos]);
  if (!show || !pos) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.col * 62 + 20,
        top: pos.row * 62 + 20,
        pointerEvents: 'none',
        fontSize: 24,
        animation: 'pop 0.6s ease',
      }}
    >
      ✨✨
    </div>
  );
}