import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HintTooltipProps {
  children: React.ReactNode;
  hint: string;
  visible: boolean;
  onDismiss: () => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  showDelay?: number;
}

export function HintTooltip({
  children,
  hint,
  visible,
  onDismiss,
  side = 'bottom',
  align = 'center',
  showDelay = 1000,
}: HintTooltipProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShowHint(true), showDelay);
      return () => clearTimeout(timer);
    } else {
      setShowHint(false);
    }
  }, [visible, showDelay]);

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const alignClasses = {
    start: side === 'top' || side === 'bottom' ? 'left-0' : 'top-0',
    center: side === 'top' || side === 'bottom' ? 'left-1/2 -translate-x-1/2' : 'top-1/2 -translate-y-1/2',
    end: side === 'top' || side === 'bottom' ? 'right-0' : 'bottom-0',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-primary/90 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-primary/90 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-primary/90 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-primary/90 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <div className="relative inline-block">
      {/* Highlight ring around the element */}
      {showHint && (
        <div className="absolute -inset-1 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse pointer-events-none z-[99]" />
      )}
      {children}
      {showHint && (
        <div
          className={cn(
            'absolute z-[100] animate-in fade-in-0 zoom-in-95 duration-200',
            positionClasses[side],
            alignClasses[align]
          )}
        >
          <div className="relative flex items-center gap-2 rounded-lg bg-primary/90 px-3 py-1.5 text-primary-foreground shadow-lg backdrop-blur-sm whitespace-nowrap">
            <Lightbulb className="h-3.5 w-3.5 flex-shrink-0" />
            <p className="text-xs">{hint}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="ml-1 flex-shrink-0 rounded-full p-0.5 hover:bg-primary-foreground/20 transition-colors"
              aria-label="Dismiss hint"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* Arrow */}
            <div
              className={cn(
                'absolute border-[6px]',
                arrowClasses[side]
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
