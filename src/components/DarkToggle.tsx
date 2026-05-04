interface Props { isDark: boolean; onToggle: () => void; }

export function DarkToggle({ isDark, onToggle }: Props) {
  return (
    <button role="switch" aria-checked={isDark} onClick={onToggle}
      className="flex items-center gap-1.5 focus:outline-none select-none">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke={isDark ? '#a78bfa' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-violet-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}
