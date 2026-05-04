import { useState } from 'react';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const toggleDark = () => setIsDark(d => {
    const n = !d;
    localStorage.setItem('theme', n ? 'dark' : 'light');
    return n;
  });
  return { isDark, toggleDark } as const;
}
