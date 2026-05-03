import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

export function ConnectionBanner() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = getSocket();

    const show = () => {
      if (timer.current) return; // already pending
      timer.current = setTimeout(() => { timer.current = null; setVisible(true); }, 1500);
    };
    const hide = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setVisible(false);
    };

    if (!s) { show(); return () => { if (timer.current) clearTimeout(timer.current); }; }

    if (!s.connected) show();
    s.on('connect',    hide);
    s.on('disconnect', show);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      s.off('connect',    hide);
      s.off('disconnect', show);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-red-600 text-white text-xs font-mono py-1 px-3 select-none">
      <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse flex-none" />
      Cannot reach server — reconnecting…
    </div>
  );
}
