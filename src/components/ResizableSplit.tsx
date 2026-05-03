import { useState, useRef, useCallback } from 'react';

interface Props {
  first: React.ReactNode;
  second: React.ReactNode;
  direction?: 'vertical' | 'horizontal';
  initialFirstPct?: number;
  minPct?: number;
  className?: string;
}

export function ResizableSplit({
  first, second,
  direction = 'vertical',
  initialFirstPct = 50,
  minPct = 15,
  className = '',
}: Props) {
  const [firstFlex, setFirstFlex] = useState(initialFirstPct);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const isV = direction === 'vertical';

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMove = (me: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const raw = isV
        ? ((me.clientY - rect.top) / rect.height) * 100
        : ((me.clientX - rect.left) / rect.width) * 100;
      setFirstFlex(Math.min(100 - minPct, Math.max(minPct, raw)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isV, minPct]);

  return (
    <div ref={containerRef} className={`flex ${isV ? 'flex-col' : 'flex-row'} h-full w-full ${className}`}>
      <div style={{ flex: firstFlex }} className={isV ? 'min-h-0 overflow-hidden' : 'min-w-0 overflow-hidden'}>
        {first}
      </div>
      <div
        className={`flex-none ${isV ? 'h-1.5 cursor-row-resize w-full' : 'w-1.5 cursor-col-resize h-full'} bg-slate-200 dark:bg-gray-700 hover:bg-violet-300 dark:hover:bg-violet-700 transition-colors flex items-center justify-center select-none`}
        onMouseDown={onMouseDown}
      >
        {isV
          ? <div className="w-8 h-0.5 rounded bg-slate-400 dark:bg-gray-500 pointer-events-none" />
          : <div className="h-8 w-0.5 rounded bg-slate-400 dark:bg-gray-500 pointer-events-none" />
        }
      </div>
      <div style={{ flex: 100 - firstFlex }} className={isV ? 'min-h-0 overflow-hidden' : 'min-w-0 overflow-hidden'}>
        {second}
      </div>
    </div>
  );
}
