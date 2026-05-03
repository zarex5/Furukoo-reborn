import { useState, useEffect } from 'react';
import { getSocket } from '../lib/socket';

export function ConnectionBanner() {
  const [connected, setConnected] = useState(true); // optimistic — avoids flash on load

  useEffect(() => {
    const s = getSocket();
    if (!s) { setConnected(false); return; }
    setConnected(s.connected);
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect',    onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect',    onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  if (connected) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-red-600 text-white text-xs font-mono py-1 px-3 select-none">
      <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse flex-none" />
      Cannot reach server — reconnecting…
    </div>
  );
}
