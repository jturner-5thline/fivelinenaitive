/**
 * AIAssistOverlay — generic wrapper used by every in-scope AI Assist
 * action panel. Panels render via portal into a host slot provided by
 * <AIAssistOverlayProvider>, sitting absolutely on top of the rail's
 * scroll area instead of pushing the action grid downward.
 *
 * Behavior:
 *  - One overlay open at a time (caller controls `open`).
 *  - X button + Escape close.
 *  - Width matches the rail; internal scroll if content exceeds height.
 *  - z-20 — above the action grid, below toasts/modals (z-50+).
 *  - Action buttons stay mounted behind for instant re-open.
 */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OverlayCtx {
  host: HTMLDivElement | null;
}
const Ctx = createContext<OverlayCtx>({ host: null });

export function AIAssistOverlayProvider({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <Ctx.Provider value={{ host }}>
      <div className={cn('relative flex-1 min-h-0 min-w-0 w-full flex flex-col', className)}>
        {children}
        {/* Overlay host — pointer-events-none keeps clicks falling through
            to the rail unless an overlay actively renders inside. */}
        <div
          ref={setHost}
          className="pointer-events-none absolute inset-0 z-20"
          aria-hidden={!host}
        />
      </div>
    </Ctx.Provider>
  );
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Skip rendering the wrapper's own X (panel renders its own). */
  hideClose?: boolean;
}

export function AIAssistOverlay({ open, onClose, title, children, hideClose }: OverlayProps) {
  const { host } = useContext(Ctx);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open || !host) return null;

  return createPortal(
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col rounded-xl border border-border bg-card shadow-xl overflow-hidden"
      role="dialog"
      aria-label={title || 'AI Assist panel'}
    >
      {!hideClose && (
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close panel"
          className="absolute top-2 right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {children}
      </div>
    </div>,
    host,
  );
}