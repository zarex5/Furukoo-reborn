import React from 'react';

export const FurukooLogo: React.FC<{ className?: string }> = () => {
  return (
    <svg
      viewBox="0 0 340 72"
      height="56"
      fill="none"
      aria-label="Furukoo"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3e8ff" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#9333ea" />
        </linearGradient>
        <filter id="logo-shadow" x="-5%" y="-5%" width="120%" height="140%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="1" floodColor="#6b21a8" floodOpacity="0.35" />
        </filter>
      </defs>
      {/* Subtle 3D offset layer */}
      <text
        x="170" y="58"
        textAnchor="middle"
        fontFamily="'Rakkas', serif"
        fontSize="64"
        fill="#7e22ce"
        opacity="0.18"
        dx="2.5" dy="3.5"
      >Furukoo</text>
      {/* Main text */}
      <text
        x="170" y="58"
        textAnchor="middle"
        fontFamily="'Rakkas', serif"
        fontSize="64"
        fill="url(#logo-grad)"
        filter="url(#logo-shadow)"
      >Furukoo</text>
    </svg>
  );
};
