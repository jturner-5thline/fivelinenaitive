import { useState } from 'react';
import { ChevronDown, StickyNote, Check } from 'lucide-react';
import type { Deal, DealLender, LenderTrackingStatus } from '@/types/deal';
import { LENDER_TRACKING_STATUS_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface LendersPanelProps {
  deal: Deal;
}

type Bucket = 'reviewing' | 'onhold' | 'ondeck' | 'passed';

function bucketOf(l: DealLender): Bucket {
  const ts = (l.trackingStatus || '').toLowerCase();
  const stage = (l.stage || '').toLowerCase();
  if (ts === 'passed') return 'passed';
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

const STATUS_OPTIONS: { value: LenderTrackingStatus; label: string }[] = [
  { value: 'active', label: 'Reviewing' },
  { value: 'on-deck', label: 'On deck' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'passed', label: 'Passed' },
];

function LenderRow({
  lender,
  meta,
}: {
  lender: DealLender;
  meta: typeof BUCKET_META[Bucket];
}) {
  const { updateLender } = useDealsContext();
  const [statusOpen, setStatusOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(lender.notes || '');
  const [saving, setSaving] = useState(false);
  const hasNote = !!(lender.notes && lender.notes.trim().length > 0);

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
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
      <span className="flex-1 text-xs text-foreground truncate" title={lender.name}>
        {lender.name}
      </span>

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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {lender.name} · note
          </div>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note about this lender…"
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
            title="Change status"
            className="shrink-0"
          >
            <Badge
              variant={meta.badgeVariant}
              className="text-[9px] px-1.5 py-0 rounded-full cursor-pointer hover:brightness-110"
            >
              {meta.pillLabel}
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
  const lenders = deal.lenders || [];
  const grouped: Record<Bucket, DealLender[]> = { reviewing: [], onhold: [], ondeck: [], passed: [] };
  for (const l of lenders) grouped[bucketOf(l)].push(l);
  const hasHidden = (['reviewing','onhold','ondeck','passed'] as Bucket[])
    .some(b => grouped[b].length > VISIBLE_PER_BUCKET);

  return (
    <div className="p-5 min-w-0 self-start">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={lenders.length === 0}
        className="group flex items-center gap-1.5 mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors disabled:cursor-default disabled:hover:text-muted-foreground"
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

      {lenders.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No lenders engaged.</p>
      ) : (
        <div className="space-y-3 min-w-0">
          {(['reviewing', 'onhold', 'ondeck', 'passed'] as Bucket[]).map(b => {
            const items = grouped[b];
            if (items.length === 0) return null;
            const meta = BUCKET_META[b];
            const shown = expanded ? items : items.slice(0, VISIBLE_PER_BUCKET);
            const hidden = expanded ? [] : items.slice(VISIBLE_PER_BUCKET);
            return (
              <div key={b}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {meta.label} · {items.length}
                </div>
                <div className="space-y-1">
                  {shown.map(l => (
                    <LenderRow key={l.id} lender={l} meta={meta} />
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
          {expanded && hasHidden && (
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
    </div>
  );
}