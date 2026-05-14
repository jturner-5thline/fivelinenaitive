import { X } from 'lucide-react';

type OverlayKind = 'dashboard' | 'calendar' | 'mail' | 'tasks' | 'deals';

interface OverlayLoadingShellProps {
  kind: OverlayKind;
  onClose?: () => void;
}

/**
 * Lightweight overlay skeleton shown as the Suspense fallback for any
 * lazy-loaded global overlay (Dashboard, Calendar, Mail, Tasks, Deals).
 *
 * Renders an instant full-screen backdrop + centered glass card with a
 * skeleton tailored to the destination, so the click feels immediate
 * even while the real chunk + data are still loading.
 */
export function OverlayLoadingShell({ kind, onClose }: OverlayLoadingShellProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={`Loading ${kind}`}
    >
      {/* Backdrop — translucent dark with subtle blur to mirror the real
          overlays' modal-first treatment. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(7, 10, 18, 0.55)',
          backdropFilter: 'blur(10px) saturate(120%)',
          WebkitBackdropFilter: 'blur(10px) saturate(120%)',
        }}
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-[1200px] h-[min(88vh,820px)] overflow-hidden flex flex-col"
        style={{
          borderRadius: 14,
          background: 'rgba(16, 21, 34, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header strip */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 p-5">
          <SkeletonBody kind={kind} />
        </div>
      </div>
    </div>
  );
}

function SkeletonBody({ kind }: { kind: OverlayKind }) {
  const bar = 'rounded bg-white/8 animate-pulse';
  const block = 'rounded-md bg-white/6 animate-pulse';

  if (kind === 'mail') {
    return (
      <div className="grid grid-cols-12 gap-4 h-full">
        <div className="col-span-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5 p-2 rounded">
              <div className={`${bar} h-3 w-3/4`} />
              <div className={`${bar} h-2.5 w-1/2`} />
            </div>
          ))}
        </div>
        <div className="col-span-8 space-y-3">
          <div className={`${bar} h-4 w-2/3`} />
          <div className={`${bar} h-3 w-1/3`} />
          <div className={`${block} h-full min-h-[300px]`} />
        </div>
      </div>
    );
  }

  if (kind === 'calendar') {
    return (
      <div className="space-y-3 h-full">
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`${bar} h-5 flex-1`} />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5 flex-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className={`${block} h-20`} />
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'tasks') {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${bar} h-7 w-24`} />
          ))}
        </div>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className={`${bar} h-4 w-4`} />
            <div className={`${bar} h-3 flex-1`} />
            <div className={`${bar} h-3 w-20`} />
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'deals') {
    return (
      <div className="grid grid-cols-4 gap-3 h-full">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="space-y-2">
            <div className={`${bar} h-4 w-2/3`} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`${block} h-24`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // dashboard
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${block} h-24`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${block} h-56`} />
        ))}
      </div>
    </div>
  );
}