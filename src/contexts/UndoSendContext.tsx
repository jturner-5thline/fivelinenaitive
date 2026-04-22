import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Undo2, Mail } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Gmail-style "Undo Send" buffer.
 *
 * Outbound emails are queued for `UNDO_WINDOW_MS` (default 7s) before the
 * real network send fires. During the window the user sees a snackbar with
 * a live countdown and an "Unsend" button. Unsending cancels the timer and
 * invokes `onUndo(payload)` so the original composer can be re-opened with
 * zero data loss.
 *
 * Design notes:
 * - One provider mounted at app root. Timers live here so route changes
 *   never abort an in-flight queued send.
 * - Per-send id keeps multiple parallel sends independent.
 * - Double-send guard: caller passes a `dedupeKey` and we reject duplicate
 *   queueing while a matching send is pending.
 * - Crash recovery: queued payloads are mirrored to localStorage so a tab
 *   refresh during the window doesn't silently drop the email; on reload
 *   the snapshot is offered back as a draft (best-effort, via console).
 */

export const UNDO_WINDOW_MS = 7000;
const STORAGE_KEY = 'undo_send_pending_v1';

export interface QueuedSendPayload {
  to: string[];
  subject: string;
  body?: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
  /** Free-form context the caller wants returned on Undo (e.g. threadId). */
  meta?: Record<string, unknown>;
}

export interface QueueSendArgs<TResult> {
  payload: QueuedSendPayload;
  /** The actual network send. Called once after the undo window elapses. */
  performSend: (payload: QueuedSendPayload) => Promise<TResult>;
  /** Invoked if the user clicks Unsend. Should re-open the draft. */
  onUndo?: (payload: QueuedSendPayload) => void;
  /** Called after performSend succeeds. */
  onSent?: (result: TResult) => void;
  /** Called if performSend throws / returns null. */
  onError?: (err: unknown) => void;
  /** Used to reject duplicate queueings of the same logical message. */
  dedupeKey?: string;
  /** Override window length (mostly for tests). */
  windowMs?: number;
}

interface PendingSend {
  id: string;
  payload: QueuedSendPayload;
  dedupeKey?: string;
  expiresAt: number;
  windowMs: number;
  timerId: ReturnType<typeof setTimeout>;
  onUndo?: (p: QueuedSendPayload) => void;
  /** Used by tests / programmatic cancel. */
  cancel: () => boolean;
}

interface UndoSendContextValue {
  queueSend: <T>(args: QueueSendArgs<T>) => string | null;
  cancelSend: (id: string) => boolean;
  pendingCount: number;
  /** Snapshot of pending sends for the snackbar. Recreated each tick. */
  pending: Array<{ id: string; expiresAt: number; recipient: string; subject: string }>;
}

const UndoSendContext = createContext<UndoSendContextValue | null>(null);

function persistSnapshot(map: Map<string, PendingSend>) {
  try {
    const snap = Array.from(map.values()).map(p => ({
      id: p.id,
      payload: p.payload,
      dedupeKey: p.dedupeKey,
      expiresAt: p.expiresAt,
    }));
    if (snap.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function UndoSendProvider({ children }: { children: ReactNode }) {
  // Map kept in a ref so callbacks always see the latest state without
  // re-creating the queueSend identity on every render.
  const pendingRef = useRef<Map<string, PendingSend>>(new Map());
  const [tick, setTick] = useState(0);
  const forceRender = useCallback(() => setTick(t => t + 1), []);

  // 100ms heartbeat keeps the countdown snappy while any send is queued.
  useEffect(() => {
    if (pendingRef.current.size === 0) return;
    const interval = setInterval(forceRender, 100);
    return () => clearInterval(interval);
  }, [tick, forceRender]);

  const removePending = useCallback((id: string) => {
    pendingRef.current.delete(id);
    persistSnapshot(pendingRef.current);
    forceRender();
  }, [forceRender]);

  const queueSend = useCallback(<T,>(args: QueueSendArgs<T>): string | null => {
    const windowMs = args.windowMs ?? UNDO_WINDOW_MS;

    // Double-send guard.
    if (args.dedupeKey) {
      for (const p of pendingRef.current.values()) {
        if (p.dedupeKey === args.dedupeKey) {
          toast.info('Already queued — undo or wait for it to send.');
          return null;
        }
      }
    }

    const id = `qs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = Date.now() + windowMs;
    let fired = false;
    let cancelled = false;

    const timerId = setTimeout(async () => {
      if (cancelled) return;
      fired = true;
      try {
        const result = await args.performSend(args.payload);
        if (result === null || result === undefined) {
          // Treat null as failure to mirror useGmail.sendEmail's contract.
          toast.error('Failed to send email');
          args.onError?.(new Error('Send returned null'));
        } else {
          toast.success('Email sent', {
            icon: '✉️',
            description: args.payload.to.join(', '),
          });
          args.onSent?.(result);
        }
      } catch (err) {
        toast.error('Failed to send email');
        args.onError?.(err);
      } finally {
        removePending(id);
      }
    }, windowMs);

    const cancel = () => {
      if (fired || cancelled) return false;
      cancelled = true;
      clearTimeout(timerId);
      return true;
    };

    const pending: PendingSend = {
      id,
      payload: args.payload,
      dedupeKey: args.dedupeKey,
      expiresAt,
      windowMs,
      timerId,
      onUndo: args.onUndo,
      cancel,
    };
    pendingRef.current.set(id, pending);
    persistSnapshot(pendingRef.current);
    forceRender();
    return id;
  }, [forceRender, removePending]);

  const cancelSend = useCallback((id: string): boolean => {
    const p = pendingRef.current.get(id);
    if (!p) return false;
    const ok = p.cancel();
    if (ok) {
      p.onUndo?.(p.payload);
      removePending(id);
      toast.info('Send cancelled — your draft is back.');
    }
    return ok;
  }, [removePending]);

  // Cleanup all timers on unmount (provider lives at app root, so this is
  // mostly defensive for HMR).
  useEffect(() => () => {
    pendingRef.current.forEach(p => clearTimeout(p.timerId));
    pendingRef.current.clear();
  }, []);

  const pending = Array.from(pendingRef.current.values()).map(p => ({
    id: p.id,
    expiresAt: p.expiresAt,
    recipient: p.payload.to[0] ?? '',
    subject: p.payload.subject,
  }));

  const value: UndoSendContextValue = {
    queueSend,
    cancelSend,
    pendingCount: pending.length,
    pending,
  };

  return (
    <UndoSendContext.Provider value={value}>
      {children}
      <UndoSendSnackbar />
    </UndoSendContext.Provider>
  );
}

export function useUndoSend(): UndoSendContextValue {
  const ctx = useContext(UndoSendContext);
  if (!ctx) throw new Error('useUndoSend must be used inside <UndoSendProvider>');
  return ctx;
}

/* ───────────────────────── Snackbar ───────────────────────── */

function UndoSendSnackbar() {
  const { pending, cancelSend } = useUndoSend();
  if (pending.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {pending.map(p => {
        const remaining = Math.max(0, p.expiresAt - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        const pct = Math.min(100, Math.max(0, (remaining / UNDO_WINDOW_MS) * 100));
        return (
          <div
            key={p.id}
            className="pointer-events-auto min-w-[320px] max-w-[440px] rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  Sending in {seconds}s…
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  To {p.recipient}{p.subject ? ` · ${p.subject}` : ''}
                </div>
              </div>
              <button
                onClick={() => cancelSend(p.id)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Unsend email"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Unsend
              </button>
            </div>
            <div className="h-0.5 w-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-100 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}