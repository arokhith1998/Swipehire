/**
 * SwipeHire identity — Linear × Stripe hybrid.
 *
 * Mark: three calibration bars in a soft rounded square. Reads as
 * signal / routing / precision (intentionally NOT a heart, swipe, or
 * generic-HR briefcase). Single-color: takes accent in default skin,
 * monochrome on print / favicons via `currentColor`.
 *
 * Wordmark: Inter 700 with -0.04em tracking. Mixed-case "SwipeHire" reads
 * cleanly at all sizes; the mark scales independently.
 */
interface SwipeHireLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  /** Tone defaults to 'accent' (teal mark, ink wordmark). 'mono' uses currentColor everywhere. */
  tone?: 'accent' | 'mono';
  className?: string;
}

const SIZE_PX: Record<NonNullable<SwipeHireLogoProps['size']>, number> = {
  sm: 20,
  md: 26,
  lg: 36,
  xl: 48,
};

const TEXT_SIZE: Record<NonNullable<SwipeHireLogoProps['size']>, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-4xl',
};

export function SwipeHireMark({ size = 26, className = '', accent = true }: { size?: number; className?: string; accent?: boolean }) {
  const fill = accent ? 'hsl(var(--accent-h), var(--accent-s), var(--accent-l))' : 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Soft rounded-square tile */}
      <rect x="1" y="1" width="22" height="22" rx="6" fill={fill} />
      {/* Three calibration bars, slightly varied widths — signal + precision motif */}
      <rect x="5.5" y="7.5"  width="13"  height="1.8" rx="0.9" fill="white" />
      <rect x="5.5" y="11.1" width="8.5" height="1.8" rx="0.9" fill="white" />
      <rect x="5.5" y="14.7" width="11"  height="1.8" rx="0.9" fill="white" />
    </svg>
  );
}

export function SwipeHireLogo({ size = 'md', showText = true, tone = 'accent', className = '' }: SwipeHireLogoProps) {
  const px = SIZE_PX[size];
  const textKlass = TEXT_SIZE[size];
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <SwipeHireMark size={px} accent={tone === 'accent'} />
      {showText && (
        <span
          className={`font-bold leading-none ${textKlass}`}
          style={{ letterSpacing: '-0.04em', color: tone === 'accent' ? 'var(--foreground)' : 'currentColor' }}
        >
          SwipeHire
        </span>
      )}
    </div>
  );
}
