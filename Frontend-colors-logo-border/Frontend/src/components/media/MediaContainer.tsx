import { useState } from 'react';
import './MediaContainer.css';

export type AspectRatio = '16x9' | '4x3' | '1x1' | '3x4';
export type AccentTone = 'gold' | 'terracotta' | 'forest' | 'indigo';

export interface MediaContainerProps {
  src?: string;
  alt: string;
  aspectRatio?: AspectRatio;
  accentTone?: AccentTone;
  monogram?: string;
  priority?: boolean;
  className?: string;
}

function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function MediaContainer({
  src,
  alt,
  aspectRatio = '4x3',
  accentTone = 'gold',
  monogram,
  priority = false,
  className = '',
}: MediaContainerProps) {
  const [hasError, setHasError] = useState(false);
  const showImage = Boolean(src) && !hasError;

  return (
    <div className={`zibi-media zibi-media--${aspectRatio} ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className="zibi-media__img"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className={`zibi-media__placeholder zibi-media__placeholder--${accentTone} pattern-ndop`}
          role="img"
          aria-label={alt}
        >
          <svg
            className="zibi-media__motif"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M32 4L60 32L32 60L4 32L32 4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeOpacity="0.55"
            />
            <path
              d="M32 16L48 32L32 48L16 32L32 16Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeOpacity="0.35"
            />
          </svg>
          {monogram && (
            <span className="zibi-media__monogram">{getInitials(monogram)}</span>
          )}
        </div>
      )}
    </div>
  );
}
