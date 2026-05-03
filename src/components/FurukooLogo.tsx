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
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7e22ce" />
        </linearGradient>
        <filter id="logo-shadow" x="-5%" y="-5%" width="120%" height="140%">
          <feDropShadow dx="2" dy="3" stdDeviation="1.5" floodColor="#581c87" floodOpacity="0.55" />
        </filter>
      </defs>
      {/* 3D layered shadow: offset copies behind the main text */}
      <text
        x="170" y="58"
        textAnchor="middle"
        fontFamily="'Dancing Script', cursive"
        fontWeight="700"
        fontSize="64"
        fill="#581c87"
        opacity="0.4"
        dx="3" dy="4"
      >Furukoo</text>
      <text
        x="170" y="58"
        textAnchor="middle"
        fontFamily="'Dancing Script', cursive"
        fontWeight="700"
        fontSize="64"
        fill="url(#logo-grad)"
        filter="url(#logo-shadow)"
      >Furukoo</text>
    </svg>
  );
};
