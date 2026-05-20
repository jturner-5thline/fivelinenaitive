import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import type { DealLender } from '@/types/deal';
import type { LenderStageConfig } from '@/utils/dealExport';

/**
 * In-place lender management surface launched from the Status Report's
 * Pipeline Snapshot. Edits here write directly to the same lender record
 * used everywhere else in the deal (single source of truth — no
 * report-only editing layer). The parent re-syncs `deal.lenders` after
 * each save so the report buckets refresh immediately.
 */

const TRACKING_OPTIONS: { value: string; label: string }[] = [
  { value: 'on-deck', label: 'On Deck' },
  { value: 'active', label: 'Active / In Review' },
  { value: 'passed', label: 'Passed' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'closed-won', label: 'Closed / Won' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketKey: 'onDeck' | 'inReview' | 'termsIssued' | 'passed';
  bucketLabel: string;
  bucketAccent: 'blue' | 'teal' | 'green' | 'red';
  lenders: DealLender[];
  configuredStages?: LenderStageConfig[];
  onUpdateLender: (lenderId: string, updates: Partial<DealLender>) => Promise<void>;
}

interface RowState {
  stage: string;
  trackingStatus: string;
  notes: string;
  passReason: string;
  saving: boolean;
  savedAt: number | null;
}

function buildRowState(l: DealLender): RowState {
  return {
    stage: l.stage || '',
    trackingStatus: (l.trackingStatus as string) || 'active',
    notes: l.notes || '',
    passReason: l.passReason || '',
    saving: false,
    savedAt: null,
  };
}

function isRowDirty(row: RowState, l: DealLender): boolean {
  return (
    row.stage !== (l.stage || '') ||
    row.trackingStatus !== ((l.trackingStatus as string) || 'active') ||
    row.notes !== (l.notes || '') ||
    row.passReason !== (l.passReason || '')
  );
}

const ACCENT_GRADIENTS: Record<Props['bucketAccent'], string> = {
  blue: 'linear-gradient(135deg, hsl(220 85% 60% / 0.18), hsl(215 90% 50% / 0.05))',
  teal: 'linear-gradient(135deg, hsl(190 85% 55% / 0.18), hsl(175 80% 45% / 0.05))',
  green: 'linear-gradient(135deg, hsl(150 75% 50% / 0.18), hsl(160 70% 40% / 0.05))',
  red: 'linear-gradient(135deg, hsl(0 80% 60% / 0.18), hsl(355 80% 50% / 0.05))',
};
const ACCENT_BORDERS: Record<Props['bucketAccent'], string> = {
  blue: 'hsl(220 75% 55% / 0.35)',
  teal: 'hsl(185 75% 50% / 0.35)',
  green: 'hsl(150 65% 45% / 0.35)',
  red: 'hsl(0 70% 55% / 0.35)',
};

export function LenderStageManageDialog({
  open,
  onOpenChange,
  bucketKey,
  bucketLabel,
  bucketAccent,
  lenders,
  configuredStages,
  onUpdateLender,
}: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  // Re-seed local row state whenever the modal opens or lender list changes.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, RowState> = {};
    for (const l of lenders) next[l.id] = buildRowState(l);
    setRows(next);
  }, [open, lenders]);

  const stageOptions = useMemo(
    () => (configuredStages || []).map((s) => ({ value: s.id, label: s.label })),
    [configuredStages],
  );

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSaveRow = async (lender: DealLender) => {
    const row = rows[lender.id];
    if (!row || !isRowDirty(row, lender)) return;
    updateRow(lender.id, { saving: true });
    try {
      const updates: Partial<DealLender> = {};
      if (row.stage !== (lender.stage || '')) updates.stage = row.stage as any;
      if (row.trackingStatus !== ((lender.trackingStatus as string) || 'active')) {
        updates.trackingStatus = row.trackingStatus as any;
      }
      if (row.notes !== (lender.notes || '')) updates.notes = row.notes;
      if (row.passReason !== (lender.passReason || '')) updates.passReason = row.passReason;
      await onUpdateLender(lender.id, updates);
      updateRow(lender.id, { saving: false, savedAt: Date.now() });
      toast({ title: 'Lender updated', description: `${lender.name} saved to deal.` });
    } catch (e: any) {
      updateRow(lender.id, { saving: false });
      toast({
        title: 'Save failed',
        description: e?.message || 'Could not update lender.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden border-transparent shadow-2xl shadow-black/40 rounded-2xl z-[1320]"
        overlayClassName="z-[1310]"
        style={{
          background:
            'linear-gradient(155deg, hsl(222 28% 11%) 0%, hsl(220 25% 8%) 60%, hsl(218 22% 6%) 100%)',
          border: `1px solid ${ACCENT_BORDERS[bucketAccent]}`,
        }}
      >
        <DialogHeader
          className="px-6 pt-5 pb-3 shrink-0"
          style={{ background: ACCENT_GRADIENTS[bucketAccent], borderBottom: '1px solid hsl(220 25% 18%)' }}
        >
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: ACCENT_BORDERS[bucketAccent], boxShadow: `0 0 12px ${ACCENT_BORDERS[bucketAccent]}` }}
            />
            Manage {bucketLabel}
            <span className="ml-2 text-xs font-normal text-slate-400">
              {lenders.length} lender{lenders.length === 1 ? '' : 's'}
            </span>
          </DialogTitle>
          <p className="text-xs text-slate-400">
            Edits sync directly to the funding source record on this deal. Changes appear in the report immediately.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {lenders.length === 0 && (
            <div className="text-sm text-slate-400 italic py-8 text-center">
              No funding sources in this stage yet.
            </div>
          )}

          {lenders.map((l) => {
            const row = rows[l.id] || buildRowState(l);
            const dirty = isRowDirty(row, l);
            const recentlySaved = row.savedAt && Date.now() - row.savedAt < 2500;
            return (
              <div
                key={l.id}
                className="rounded-xl border border-slate-700/60 p-4 space-y-3"
                style={{
                  background:
                    'linear-gradient(180deg, hsl(220 22% 14% / 0.85) 0%, hsl(220 22% 11% / 0.85) 100%)',
                  boxShadow:
                    'inset 0 1px 0 hsl(220 30% 70% / 0.06), 0 4px 18px hsl(220 50% 5% / 0.4)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100 truncate">{l.name}</div>
                  <Button
                    size="sm"
                    variant={dirty ? 'default' : 'ghost'}
                    className="h-7 gap-1.5 text-xs"
                    disabled={!dirty || row.saving}
                    onClick={() => handleSaveRow(l)}
                  >
                    {row.saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : recentlySaved ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {row.saving ? 'Saving' : recentlySaved ? 'Saved' : 'Save'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">
                      Stage
                    </label>
                    <Select
                      value={row.stage}
                      onValueChange={(v) => updateRow(l.id, { stage: v })}
                    >
                      <SelectTrigger className="h-8 text-xs bg-slate-900/60 border-slate-700 text-slate-100">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent className="z-[1330]">
                        {stageOptions.length === 0 ? (
                          <SelectItem value={row.stage || 'unknown'}>
                            {row.stage || '— none —'}
                          </SelectItem>
                        ) : (
                          stageOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">
                      Tracking Status
                    </label>
                    <Select
                      value={row.trackingStatus}
                      onValueChange={(v) => updateRow(l.id, { trackingStatus: v })}
                    >
                      <SelectTrigger className="h-8 text-xs bg-slate-900/60 border-slate-700 text-slate-100">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent className="z-[1330]">
                        {TRACKING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {bucketKey === 'passed' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">
                      Pass Reason
                    </label>
                    <Textarea
                      value={row.passReason}
                      onChange={(e) => updateRow(l.id, { passReason: e.target.value })}
                      className="text-xs min-h-[48px] bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
                      placeholder="Why did this funding source pass?"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">
                    Notes
                  </label>
                  <Textarea
                    value={row.notes}
                    onChange={(e) => updateRow(l.id, { notes: e.target.value })}
                    className="text-xs min-h-[60px] bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
                    placeholder="Internal notes for this funding source…"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}