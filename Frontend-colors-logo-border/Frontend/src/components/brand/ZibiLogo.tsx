import './Brand.css';

/** Talking-drum mark from the ZIBI logo. Body color follows `color` (brand red by default). */
export function ZibiMark({
  size = 44,
  className = '',
  decorative = false,
}: {
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      className={`zibi-mark ${className}`}
      viewBox="-12 0 124 100"
      width={size}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'ZIBI talking drum' })}
    >
      <path
        d="M20 16C20 16 41 42 41 50C41 58 20 84 20 84L80 84C80 84 59 58 59 50C59 42 80 16 80 16Z"
        fill="currentColor"
        stroke="#F2B705"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <ellipse cx="50" cy="15" rx="31" ry="9" fill="#F2B705" stroke="#14100C" strokeWidth="2" />
      <ellipse cx="50" cy="85" rx="31" ry="9" fill="#F2B705" stroke="#14100C" strokeWidth="2" />
      <path
        d="M29 24L46 44M71 24L54 44M29 76L46 56M71 76L54 56"
        stroke="#FFF4DC"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M42 50L46 44L50 50L46 56Z M50 50L54 44L58 50L54 56Z" fill="#C8372D" />
      <path
        d="M8 38Q1 50 8 62M-1 30Q-12 50 -1 70M92 38Q99 50 92 62M101 30Q112 50 101 70"
        fill="none"
        stroke="#F08A24"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DottedI() {
  return (
    <svg viewBox="0 0 20 62" aria-hidden="true" className="zibi-wordmark__i">
      <circle cx="10" cy="9" r="8.5" fill="#F08A24" />
      <rect x="2" y="24" width="16" height="38" rx="8" fill="currentColor" />
    </svg>
  );
}

/** "ZIBI" wordmark: both i's are drawn as glyphs with an orange dot. Size it with font-size. */
export function ZibiWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`zibi-wordmark ${className}`} role="img" aria-label="ZIBI">
      <b aria-hidden="true">Z</b>
      <DottedI />
      <b aria-hidden="true">B</b>
      <DottedI />
    </span>
  );
}

/** Drum mark + wordmark lockup used in the navbar. */
export function ZibiLogo({ markSize = 44, className = '' }: { markSize?: number; className?: string }) {
  return (
    <span className={`zibi-logo ${className}`}>
      <ZibiMark size={markSize} />
      <ZibiWordmark />
    </span>
  );
}
