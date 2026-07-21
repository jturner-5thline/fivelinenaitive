import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, StickyNote, Check, ListChecks, Maximize2 } from 'lucide-react';
import type { Deal, DealLender, LenderTrackingStatus } from '@/types/deal';
import { LENDER_TRACKING_STATUS_CONFIG, LENDER_STAGE_CONFIG } from '@/types/deal';
import { bucketLender, isExcludedFromClientReport } from '@/lib/lenderStatusBuckets';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface LendersPanelProps {
  deal: Deal;
}

type Bucket = 'reviewing' | 'onhold' | 'ondeck' | 'passed';

function isPassedLikeStage(stage: string): boolean {
  return /\b(pass(ed)?|declin(?:ed)?|reject(?:ed)?|not\s+a\s+fit|unresponsive|no\s+go|no-go)\b/.test(
    stage.replace(/[-_]+/g, ' '),
  );
}

function bucketOf(l: DealLender): Bucket {
  const ts = (l.trackingStatus || '').toLowerCase();
  const stage = (l.stage || '').toLowerCase();
  if (ts === 'passed' || isPassedLikeStage(stage)) return 'passed';
  if (ts === 'on-hold' || ts === 'onhold' || /hold/.test(stage)) return 'onhold';
  if (ts === 'on-deck' || ts === 'ondeck') return 'ondeck';
  return 'reviewing';
}

const BUCKET_META: Record<
  Bucket,
  { label: string; dot: string; badgeVariant: 'green' | 'amber' | 'gray'; pillLabel: string }
> = {
  reviewing: { label: 'Reviewing', dot: 'bg-emerald-500', badgeVariant: 'green', pillLabel: 'reviewing' },
  onhold: { label: 'On hold', dot: 'bg-amber-500', badgeVariant: 'amber', pillLabel: 'on hold' },
  ondeck: { label: 'On deck', dot: 'bg-muted-foreground/70', badgeVariant: 'gray', pillLabel: 'on deck' },
  passed: { label: 'Passed', dot: 'bg-muted-foreground/50', badgeVariant: 'gray', pillLabel: 'passed' },
};

const VISIBLE_PER_BUCKET = 2;

type LenderTagVariant = 'destructive' | 'amber' | 'blue' | 'green' | 'gray';

/**
 * Derive the displayed lender tag from the same status buckets used by the
 * Funding Sources tab snapshot (On Deck / In Review / Terms Issued / Passed,
 * plus On Hold). Tag color mirrors the funding source column color so the
 * two surfaces stay in visual lockstep.
 */
function deriveLenderTag(l: DealLender): { label: string; variant: LenderTagVariant } {
  const ts = (l.trackingStatus || '').toString().trim().toLowerCase();
  // On Hold / Excluded — surface as an amber "On Hold" tag.
  if (ts === 'on-hold' || ts === 'on hold' || isExcludedFromClientReport(l)) {
    return { label: 'On Hold', variant: 'amber' };
  }
  const bucket = bucketLender(l);
  switch (bucket) {
    case 'passed':
      return { label: 'Passed', variant: 'destructive' };
    case 'termsIssued':
      return { label: 'Terms Issued', variant: 'green' };
    case 'inReview':
      return { label: 'In Review', variant: 'green' };
    case 'onDeck':
      return { label: 'On Deck', variant: 'blue' };
    default:
      return { label: 'On Deck', variant: 'blue' };
  }
}

const STATUS_OPTIONS: { value: LenderTrackingStatus; label: string }[] = [
  { value: 'active', label: 'Reviewing' },
  { value: 'on-deck', label: 'On deck' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'passed', label: 'Passed' },
];

function LenderRow({
  lender,
  meta,
  selectionMode,
  selected,
  onToggleSelected,
}: {
  lender: DealLender;
  meta: typeof BUCKET_META[Bucket];
  selectionMode: boolean;
  selected: boolean;
  onToggleSelected: (id: string, next: boolean) => void;
}) {
  const { updateLender } = useDealsContext();
  const [statusOpen, setStatusOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(lender.notes || '');
  const [saving, setSaving] = useState(false);
  const hasNote = !!(lender.notes && lender.notes.trim().length > 0);
  // Tag is always derived from the latest deal-lender record (source of truth).
  const tag = useMemo(() => deriveLenderTag(lender), [lender.stage, lender.trackingStatus]);
  const [noteHoverOpen, setNoteHoverOpen] = useState(false);
  const noteUpdatedLabel = (() => {
    const ts = lender.notesUpdatedAt || lender.updatedAt;
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  })();

  const handleStatusChange = async (next: LenderTrackingStatus) => {
    setStatusOpen(false);
    if (next === lender.trackingStatus) return;
    try {
      await updateLender(lender.id, { trackingStatus: next });
      toast.success('Lender status updated');
    } catch {
      toast.error('Failed to update lender status');
    }
  };

  const handleSaveNote = async () => {
    setSaving(true);
    try {
      await updateLender(lender.id, { notes: noteDraft.trim() });
      toast.success('Lender note saved');
      setNotesOpen(false);
    } catch {
      toast.error('Failed to save lender note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {selectionMode && (
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onToggleSelected(lender.id, !!v)}
          aria-label={`Select ${lender.name}`}
          className="h-3.5 w-3.5 shrink-0"
        />
      )}
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
      <HoverCard openDelay={250} closeDelay={80} open={noteHoverOpen} onOpenChange={setNoteHoverOpen}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setNoteHoverOpen((o) => !o);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-left text-xs text-foreground truncate cursor-help decoration-dotted decoration-muted-foreground/50 underline-offset-[3px] hover:underline hover:text-foreground focus-visible:underline focus-visible:outline-none focus-visible:text-foreground transition-colors"
            style={undefined}
            aria-label={`${lender.name} status note`}
          >
            <span className="text-[13px] font-medium text-foreground">{lender.name || 'Unnamed lender'}</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          side="top"
          collisionPadding={8}
          className="w-64 p-3 text-xs pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-1">
            {lender.name}
          </div>
          {hasNote ? (
            <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-snug">
              {lender.notes}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No current status note.</p>
          )}
          {noteUpdatedLabel && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              Updated {noteUpdatedLabel}
            </div>
          )}
        </HoverCardContent>
      </HoverCard>

      <Popover
        open={notesOpen}
        onOpenChange={(o) => {
          setNotesOpen(o);
          if (o) setNoteDraft(lender.notes || '');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={hasNote ? 'Edit lender note' : 'Add lender note'}
            title={hasNote ? lender.notes || 'Edit note' : 'Add note'}
            className={cn(
              'shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full hover:bg-muted/60 transition-colors',
              hasNote ? 'text-primary' : 'text-muted-foreground/60 hover:text-foreground'
            )}
          >
            <StickyNote className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 p-3 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-1.5">
            {lender.name} · note
          </div>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note about this funding source…"
            rows={4}
            className="text-xs resize-none"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setNotesOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSaveNote} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Change lender status"
            title={`Stage: ${tag.label} · click to change`}
            className="shrink-0"
          >
            <Badge
              variant={tag.variant}
              className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer font-semibold hover:brightness-110"
            >
              {tag.label}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-40 p-1 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col">
            {STATUS_OPTIONS.map((opt) => {
              const selected = lender.trackingStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn(
                    'flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-left',
                    selected && 'text-primary font-medium'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        LENDER_TRACKING_STATUS_CONFIG[opt.value]?.color || 'bg-muted'
                      )}
                    />
                    {opt.label}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function LendersPanel({ deal }: LendersPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkNoteOpen, setBulkNoteOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteMode, setBulkNoteMode] = useState<'replace' | 'append'>('append');
  const [bulkSaving, setBulkSaving] = useState(false);
  const { updateLender } = useDealsContext();
  const lenders = deal.lenders || [];
  const selectedLenders = useMemo(
    () => lenders.filter((l) => selectedIds.has(l.id)),
    [lenders, selectedIds],
  );

  const toggleSelected = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id); else s.delete(id);
      return s;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(lenders.map((l) => l.id)));
  };

  const applyBulkStatus = async (status: LenderTrackingStatus) => {
    if (selectedLenders.length === 0) return;
    setBulkStatusOpen(false);
    setBulkSaving(true);
    try {
      const results = await Promise.allSettled(
        selectedLenders.map((l) => updateLender(l.id, { trackingStatus: status })),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        toast.success(`Updated ${selectedLenders.length} lender${selectedLenders.length === 1 ? '' : 's'}`);
        exitSelectionMode();
      } else {
        toast.error(`Failed to update ${failed} of ${selectedLenders.length} lenders`);
      }
    } finally {
      setBulkSaving(false);
    }
  };

  const applyBulkNote = async () => {
    if (selectedLenders.length === 0) return;
    const text = bulkNote.trim();
    if (!text) {
      toast.error('Enter a note first');
      return;
    }
    setBulkSaving(true);
    try {
      const results = await Promise.allSettled(
        selectedLenders.map((l) => {
          const next =
            bulkNoteMode === 'replace'
              ? text
              : [l.notes?.trim(), text].filter(Boolean).join('\n\n');
          return updateLender(l.id, { notes: next });
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        toast.success(`Note ${bulkNoteMode === 'replace' ? 'set on' : 'appended to'} ${selectedLenders.length} lender${selectedLenders.length === 1 ? '' : 's'}`);
        setBulkNote('');
        setBulkNoteOpen(false);
        exitSelectionMode();
      } else {
        toast.error(`Failed to update ${failed} of ${selectedLenders.length} lenders`);
      }
    } finally {
      setBulkSaving(false);
    }
  };

  const grouped: Record<Bucket, DealLender[]> = { reviewing: [], onhold: [], ondeck: [], passed: [] };
  for (const l of lenders) grouped[bucketOf(l)].push(l);
  const hasHidden = (['reviewing','onhold','ondeck','passed'] as Bucket[])
    .some(b => grouped[b].length > VISIBLE_PER_BUCKET);

  // Reset bulk-edit/expansion state when the deal switches so we never
  // momentarily show the previous deal's selection or stage state.
  useEffect(() => {
    setExpanded(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [deal.id]);

  // Dev-only invariant: every rendered group header must have a non-empty
  // label. Bucket meta labels are hardcoded, so this guards against future
  // regressions where grouping switches to a dynamic key.
  if (import.meta.env.DEV) {
    for (const b of ['reviewing','onhold','ondeck','passed'] as Bucket[]) {
      if (grouped[b].length > 0 && !BUCKET_META[b]?.label) {
        // eslint-disable-next-line no-console
        console.error('[LendersPanel] empty stage label for non-empty group', {
          dealId: deal.id,
          bucket: b,
          count: grouped[b].length,
        });
      }
      for (const l of grouped[b]) {
        if (!l.name || !l.name.trim()) {
          // eslint-disable-next-line no-console
          console.warn('[LendersPanel] lender with empty name', {
            dealId: deal.id,
            lenderId: l.id,
          });
        }
      }
    }
  }

  return (
    <div className="p-5 min-w-0 self-start">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={lenders.length === 0}
          className="group flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90 hover:text-white transition-colors disabled:cursor-default disabled:hover:text-foreground/60"
          aria-expanded={expanded}
          title={hasHidden ? (expanded ? 'Collapse lenders' : 'Show all lenders') : undefined}
        >
          <span>Lenders{lenders.length > 0 ? ` · ${lenders.length}` : ''}</span>
          {lenders.length > 0 && (
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          )}
        </button>
          {lenders.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDetailOpen(true); }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              title="Open full lender list"
              aria-label="Open full lender list"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {lenders.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (selectionMode) {
                exitSelectionMode();
              } else {
                setSelectionMode(true);
                setExpanded(true);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider transition-colors',
              selectionMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
            title={selectionMode ? 'Exit bulk edit' : 'Bulk edit lenders'}
          >
            <ListChecks className="h-3 w-3" />
            {selectionMode ? 'Done' : 'Bulk edit'}
          </button>
        )}
      </div>

      {selectionMode && lenders.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] font-medium text-muted-foreground mr-1">
            {selectedLenders.length} selected
          </span>
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            disabled={selectedLenders.length === lenders.length}
          >
            Select all
          </button>
          {selectedLenders.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Popover open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={selectedLenders.length === 0 || bulkSaving}
                >
                  Set status
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-40 p-1 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => applyBulkStatus(opt.value)}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-left"
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          LENDER_TRACKING_STATUS_CONFIG[opt.value]?.color || 'bg-muted'
                        )}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover open={bulkNoteOpen} onOpenChange={setBulkNoteOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={selectedLenders.length === 0 || bulkSaving}
                >
                  <StickyNote className="h-3 w-3 mr-1" />
                  Note
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-3 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-1.5">
                  Note · {selectedLenders.length} lender{selectedLenders.length === 1 ? '' : 's'}
                </div>
                <Textarea
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="Note to apply to all selected lenders…"
                  rows={4}
                  className="text-xs resize-none"
                />
                <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="bulk-note-mode"
                      checked={bulkNoteMode === 'append'}
                      onChange={() => setBulkNoteMode('append')}
                    />
                    Append
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="bulk-note-mode"
                      checked={bulkNoteMode === 'replace'}
                      onChange={() => setBulkNoteMode('replace')}
                    />
                    Replace
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setBulkNoteOpen(false)}
                    disabled={bulkSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={applyBulkNote}
                    disabled={bulkSaving || !bulkNote.trim()}
                  >
                    {bulkSaving ? 'Saving…' : 'Apply'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {lenders.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No funding sources engaged.</p>
      ) : (
        <div className="space-y-3 min-w-0">
          {(['reviewing', 'onhold', 'ondeck', 'passed'] as Bucket[]).map(b => {
            const items = grouped[b];
            if (items.length === 0) return null;
            const meta = BUCKET_META[b];
            const showAll = expanded || selectionMode;
            const shown = showAll ? items : items.slice(0, VISIBLE_PER_BUCKET);
            const hidden = showAll ? [] : items.slice(VISIBLE_PER_BUCKET);
            return (
              <div key={b}>
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90 mb-1.5">
                  <span>{meta.label || 'Unassigned'} · {items.length}</span>
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const allSelected = items.every((l) => selectedIds.has(l.id));
                        setSelectedIds((prev) => {
                          const s = new Set(prev);
                          if (allSelected) {
                            items.forEach((l) => s.delete(l.id));
                          } else {
                            items.forEach((l) => s.add(l.id));
                          }
                          return s;
                        });
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="text-[9px] normal-case tracking-normal font-normal text-muted-foreground hover:text-foreground"
                    >
                      {items.every((l) => selectedIds.has(l.id)) ? 'Unselect group' : 'Select group'}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {shown.map(l => (
                    <LenderRow
                      key={l.id}
                      lender={l}
                      meta={meta}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(l.id)}
                      onToggleSelected={toggleSelected}
                    />
                  ))}
                  {hidden.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="block text-left text-[10px] text-muted-foreground italic pl-3.5 truncate hover:text-foreground transition-colors w-full"
                    >
                      {hidden.slice(0, 2).map(l => l.name).join(', ')}
                      {hidden.length > 2 ? ` + ${hidden.length - 2} more` : ''}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {expanded && hasHidden && !selectionMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
            >
              Show less
            </button>
          )}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">Lenders — {deal.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1 mt-2 space-y-4">
            {(['reviewing', 'onhold', 'ondeck', 'passed'] as Bucket[]).map((b) => {
              const items = grouped[b];
              if (items.length === 0) return null;
              const meta = BUCKET_META[b];
              return (
                <section key={`full-${b}`}>
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                    {meta.label} · {items.length}
                  </h4>
                  <div className="space-y-2">
                    {items.map((l) => (
                      <div
                        key={`full-lender-${l.id}`}
                        className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3"
                      >
                        <LenderRow
                          lender={l}
                          meta={meta}
                          selectionMode={false}
                          selected={false}
                          onToggleSelected={() => {}}
                        />
                        {l.notes && (
                          <div className="mt-2 pl-4 text-xs text-muted-foreground whitespace-pre-wrap border-l border-white/[0.06]">
                            {l.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}