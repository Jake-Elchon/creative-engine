import { useId } from 'react';

/** Red / yellow / green diamond border that separates sections (from the website design). */
export function BorderStrip({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg width="100%" height="26" aria-hidden="true" className={`zibi-border-strip ${className}`}>
      <defs>
        <pattern id={id} width="28" height="26" patternUnits="userSpaceOnUse">
          <path d="M0 13L7 4L14 13L7 22Z" fill="#C8372D" />
          <path d="M14 13L21 4L28 13L21 22Z" fill="#F2B705" />
          <circle cx="14" cy="4" r="1.6" fill="#1E8E5A" />
        </pattern>
      </defs>
      <rect width="100%" height="1.5" y="0" fill="#C8372D" />
      <rect width="100%" height="26" fill={`url(#${id})`} />
    </svg>
  );
}
