/** Small square mark: HTD yellow tile with an ink ledger glyph. */
export function Mark({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill={inverted ? '#161513' : '#FACC15'} />
      <path d="M9 22.5h14M10.5 19V14M15 19V10M19.5 19v-6.5M24 19v-3" stroke={inverted ? '#FACC15' : '#161513'} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
