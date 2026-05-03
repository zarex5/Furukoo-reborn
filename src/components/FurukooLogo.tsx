import React from 'react';

/**
 * Hand-drawn SVG logo in a Kufic/Arabic calligraphy-inspired style.
 * The top bar of the F extends rightward over u, r, u until it meets the k.
 */
export const FurukooLogo: React.FC<{ className?: string }> = ({ className }) => {
  const color = 'currentColor';
  const sw = 5;

  return (
    <svg
      viewBox="0 0 330 68"
      height="52"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Furukoo"
    >
      {/* ── Extended crossbar: top of F spans all the way to the k ── */}
      <line x1="12" y1="14" x2="196" y2="14" />

      {/* F — vertical stem + middle bar (no separate top bar, it's shared above) */}
      <line x1="12" y1="14" x2="12" y2="62" />
      <line x1="12" y1="39" x2="50"  y2="39" />

      {/* u */}
      <path d="M62,14 L62,50 Q62,64 78,64 Q94,64 94,50 L94,14" />

      {/* r — vertical + curved shoulder */}
      <line x1="106" y1="14" x2="106" y2="62" />
      <path d="M106,37 Q118,26 130,14" />

      {/* u */}
      <path d="M142,14 L142,50 Q142,64 158,64 Q174,64 174,50 L174,14" />

      {/* k — vertical + upper/lower arms meeting at crossbar height */}
      <line x1="196" y1="14" x2="196" y2="62" />
      <line x1="196" y1="39" x2="225" y2="14" />
      <line x1="196" y1="39" x2="225" y2="62" />

      {/* o */}
      <ellipse cx="258" cy="38" rx="23" ry="25" />

      {/* o */}
      <ellipse cx="307" cy="38" rx="23" ry="25" />
    </svg>
  );
};
