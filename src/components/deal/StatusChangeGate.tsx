/**
 * StatusChangeGate
 * ----------------
 * Global gate that requires a fresh status-note entry every time a deal's
 * status is changed (On Track, At Risk, Off Track, On Hold, Archived, or
 * cleared). Mounted once near the app root so every status-edit surface
 * (deal tile inline dropdown, list row dropdown, EditableDealStatusTag in
 * the daily briefing / rundown, the DealDetail header select, etc.) can
 * request a status change through a single hook:
 *
 *   const requestStatusChange = useRequestStatusChange();
 *   await requestStatusChange({ dealId, nextStatus });
 *
 * Behavior (per product spec):
 *   1. The required-note textarea starts EMPTY — never pre-filled with the
 *      prior note. The user must actively type a new note.
 *   2. Save stays disabled until a non-empty (trimmed) note is entered.
 *   3. On Save, the deal is updated with BOTH the new status and the new
 *      note text in a single write — `useDealsDatabase.updateDeal` then
 *      bumps `notes_updated_at`, which is what the tile timestamp reads.
 *   4. Cancel = nothing is persisted; the status stays whatever it was.
 */
import {
  createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { STATUS_CONFIG, type DealStatus } from '@/types/deal';
import { useDealsContext } from '@/contexts/DealsContext';
import { useInvalidateDealFreshness } from '@/hooks/useDealFreshness';

export interface StatusChangeRequest {
  dealId: string;
  /** Optional display name; falls back to the deal lookup. */
  dealName?: string;
  /** May be undefined if the caller doesn't know the previous value. */
  currentStatus?: DealStatus | null;
  /** Target status. `null` = clear status. */
  nextStatus: DealStatus | null;
}

type Resolver = (committed: boolean) => void;

interface PendingState extends StatusChangeRequest {
  resolve: Resolver;
}

const StatusChangeGateContext = createContext<
  ((req: StatusChangeRequest) => Promise<boolean>) | null
>(null);

export function useRequestStatusChange() {
  const ctx = useContext(StatusChangeGateContext);
  if (!ctx) {
    throw new Error(
      'useRequestStatusChange must be used within <StatusChangeGateProvider>',
    );
  }
  return ctx;
}

function labelFor(status: DealStatus | null | undefined): string {
  if (!status) return 'No status';
  return STATUS_CONFIG[status]?.label || status;
}

export function StatusChangeGateProvider({ children }: { children: ReactNode }) {
  const { updateDeal, getDealById } = useDealsContext();
  const invalidateFreshness = useInvalidateDealFreshness();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingState | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const closeAndResolve = useCallback((committed: boolean) => {
    setPending(prev => {
      prev?.resolve(committed);
      return null;
    });
    setNote('');
    setSaving(false);
  }, []);

  const request = useCallback<(req: StatusChangeRequest) => Promise<boolean>>(
    (req) => {
      // No-op if the requested status is identical to current.
      const known = req.currentStatus !== undefined
        ? req.currentStatus
        : (getDealById(req.dealId)?.status ?? null);
      if (known === req.nextStatus) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        setNote('');
        setSaving(false);
        setPending({ ...req, currentStatus: known, resolve });
      });
    },
    [getDealById],
  );

  const handleSave = useCallback(async () => {
    if (!pending) return;
    const trimmed = note.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      // Single write: status + notes. `useDealsDatabase.updateDeal` bumps
      // `notes_updated_at` because `notes` is in the payload, which is what
      // the tile/list/detail timestamps now read.
      await updateDeal(pending.dealId, {
        status: pending.nextStatus,
        notes: trimmed,
      });
      invalidateFreshness();
      // Mirror the cross-surface invalidations EditableDealStatusTag used
      // to do so the daily briefing / rundown reflect the change instantly.
      queryClient.invalidateQueries({ queryKey: ['briefing-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['briefing-catchup'] });
      queryClient.invalidateQueries({ queryKey: ['briefing'] });
      queryClient.invalidateQueries({ queryKey: ['naitive-pipeline-data'] });
      queryClient.invalidateQueries({ queryKey: ['finserv-pipeline-data'] });
      toast.success(
        pending.nextStatus
          ? `Status updated to ${labelFor(pending.nextStatus)}`
          : 'Status cleared',
      );
      closeAndResolve(true);
    } catch (err: any) {
      console.error('[StatusChangeGate] save failed', err);
      toast.error('Failed to update status', { description: err?.message });
      setSaving(false);
    }
  }, [pending, note, updateDeal, invalidateFreshness, queryClient, closeAndResolve]);

  const handleCancel = useCallback(() => {
    if (saving) return;
    closeAndResolve(false);
  }, [saving, closeAndResolve]);

  const dealName = pending?.dealName
    || (pending ? getDealById(pending.dealId)?.company : undefined)
    || 'this deal';

  return (
    <StatusChangeGateContext.Provider value={request}>
      {children}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) handleCancel(); }}
      >
        <DialogContent
          className="sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Add a status note</DialogTitle>
            <DialogDescription>
              {pending && (
                <>
                  Changing <span className="font-medium text-foreground">{dealName}</span> from{' '}
                  <span className="font-medium text-foreground">{labelFor(pending.currentStatus)}</span> to{' '}
                  <span className="font-medium text-foreground">{labelFor(pending.nextStatus)}</span>.
                  Write a fresh note explaining the change. The prior note is not used.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            ref={textareaRef}
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (note.trim() && !saving) handleSave();
              }
            }}
            placeholder="What changed and why?"
            className="min-h-[120px]"
            disabled={saving}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !note.trim()}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save status & note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StatusChangeGateContext.Provider>
  );
}

export default StatusChangeGateProvider;