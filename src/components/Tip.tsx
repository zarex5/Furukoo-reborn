import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

interface TipProps {
  content: string;
  children: ReactNode;
}

export function Tip({ content, children }: TipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={5}
            className="z-50 px-2 py-1 rounded text-xs font-mono bg-slate-800 text-white dark:bg-gray-100 dark:text-gray-900 shadow-md select-none"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-slate-800 dark:fill-gray-100" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
