/** Decorative spark used by the match chat UI. */
export const Sparkle = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={`shrink-0 ${className}`}>
    <path d="M10 2.5l1.6 4.9a3 3 0 001.9 1.9l4.9 1.6-4.9 1.6a3 3 0 00-1.9 1.9L10 19.3l-1.6-4.9a3 3 0 00-1.9-1.9L1.6 10.9l4.9-1.6a3 3 0 001.9-1.9L10 2.5z" />
    <path d="M19 1l.7 2.1a1.3 1.3 0 00.8.8L22.6 4.6l-2.1.7a1.3 1.3 0 00-.8.8L19 8.2l-.7-2.1a1.3 1.3 0 00-.8-.8L15.4 4.6l2.1-.7a1.3 1.3 0 00.8-.8L19 1z" />
  </svg>
);
