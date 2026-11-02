import { useState, type CSSProperties } from 'react';

interface ArtProps {
  /** Absolute asset path, or null when this chain/tier has no artwork yet. */
  src: string | null;
  /** Accessible name — pass the item's display name. */
  alt: string;
  /** Emoji shown when no artwork exists or the image fails to load. */
  emoji: string;
  /** Size/layout styles applied to both the image and the emoji fallback. */
  style?: CSSProperties;
}

/**
 * Renders illustrated artwork when available, otherwise an emoji fallback.
 *
 * If the image fails to load at runtime (missing/corrupt file), it swaps to
 * the emoji so a broken asset can never appear as an empty box. Chains
 * without artwork simply pass `src={null}` and render the emoji from the start.
 */
export default function Art({ src, alt, emoji, style }: ArtProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          ...style,
        }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}
