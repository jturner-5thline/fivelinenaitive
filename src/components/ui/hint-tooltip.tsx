import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShowHint(true), showDelay);
      return () => clearTimeout(timer);
    } else {
      setShowHint(false);
    }
  }, [visible, showDelay]);

  // Track anchor rect (for portal positioning) + escape key dismiss
  useLayoutEffect(() => {
    if (!showHint) return;
    const update = () => {
      if (wrapperRef.current) setAnchor(wrapperRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.removeEventListener('keydown', onKey);
    };
  }, [showHint, onDismiss]);

  // Compute fixed-position coords for the tooltip based on side/align
  const tooltipStyle: React.CSSProperties = (() => {
    if (!anchor) return { visibility: 'hidden' };
    const gap = 8;
    let top = 0;
    let left = 0;
    let transform = '';
    if (side === 'bottom') {
      top = anchor.bottom + gap;
      if (align === 'start') left = anchor.left;
      else if (align === 'end') { left = anchor.right; transform = 'translateX(-100%)'; }
      else { left = anchor.left + anchor.width / 2; transform = 'translateX(-50%)'; }
    } else if (side === 'top') {
      top = anchor.top - gap;
      transform = 'translateY(-100%)';
      if (align === 'start') left = anchor.left;
      else if (align === 'end') { left = anchor.right; transform += ' translateX(-100%)'; }
      else { left = anchor.left + anchor.width / 2; transform += ' translateX(-50%)'; }
    } else if (side === 'left') {
      left = anchor.left - gap;
      transform = 'translateX(-100%)';
      if (align === 'start') top = anchor.top;
      else if (align === 'end') { top = anchor.bottom; transform += ' translateY(-100%)'; }
      else { top = anchor.top + anchor.height / 2; transform += ' translateY(-50%)'; }
    } else {
      left = anchor.right + gap;
      if (align === 'start') top = anchor.top;
      else if (align === 'end') { top = anchor.bottom; transform = 'translateY(-100%)'; }
      else { top = anchor.top + anchor.height / 2; transform = 'translateY(-50%)'; }
    }
    return { position: 'fixed', top, left, transform, zIndex: 2147483000 };
  })();

  const glowStyle: React.CSSProperties | null = anchor
    ? {
        position: 'fixed',
        top: anchor.top - 8,
        left: anchor.left - 8,
        width: anchor.width + 16,
        height: anchor.height + 16,
        zIndex: 2147482999,
        pointerEvents: 'none',
        borderRadius: 12,
        background: 'hsl(220, 80%, 50%, 0.12)',
        boxShadow:
          '0 0 0 2px hsl(220, 80%, 50%, 0.55), 0 0 20px 8px hsl(220, 80%, 50%, 0.3), 0 0 40px 16px hsl(250, 70%, 55%, 0.15)',
        animation: 'hint-glow 2s ease-in-out infinite',
      }
    : null;

  return (
    <div ref={wrapperRef} className="relative inline-block min-w-0">
      {children}
      {showHint && typeof document !== 'undefined' &&
        createPortal(
          <>
            <style>{`
              @keyframes hint-glow {
                0%, 100% { opacity: 0.7; }
                50% { opacity: 1; }
              }
            `}</style>
            {glowStyle && <div style={glowStyle} />}
            <div
              style={tooltipStyle}
              className={cn('animate-in fade-in-0 zoom-in-95 duration-200')}
            >
              <div
                className="relative flex items-center gap-3 rounded-xl px-5 py-3 text-white shadow-xl shadow-blue-500/20 whitespace-nowrap border border-blue-400/30"
                style={{
                  background:
                    'linear-gradient(135deg, hsl(220, 80%, 50%), hsl(250, 70%, 55%), hsl(280, 60%, 50%))',
                }}
              >
                <Lightbulb className="h-5 w-5 flex-shrink-0 drop-shadow-sm" />
                <p className="text-sm font-medium tracking-wide">{hint}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                  }}
                  className="ml-1 flex-shrink-0 rounded-full p-1 hover:bg-white/20 transition-colors"
                  aria-label="Dismiss hint"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
