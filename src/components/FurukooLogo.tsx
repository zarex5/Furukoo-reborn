import { useNavigate } from 'react-router-dom';

export const FurukooLogo: React.FC = () => {
  const navigate = useNavigate();
  return (
    <svg
      viewBox="40 4 260 64"
      height="48"
      fill="none"
      aria-label="Furukoo"
      onClick={() => navigate('/')}
      style={{ cursor: 'pointer', overflow: 'visible' }}
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
      <text x="170" y="58" textAnchor="middle"
        fontFamily="'Rakkas', serif" fontSize="64"
        fill="#7e22ce" opacity="0.18" dx="2.5" dy="3.5">Furukoo</text>
      <text x="170" y="58" textAnchor="middle"
        fontFamily="'Rakkas', serif" fontSize="64"
        fill="url(#logo-grad)" filter="url(#logo-shadow)">Furukoo</text>
    </svg>
  );
};

export default FurukooLogo;
