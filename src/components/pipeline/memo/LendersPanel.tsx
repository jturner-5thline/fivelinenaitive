import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Deal, DealLender } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
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

export function LendersPanel({ deal }: LendersPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const lenders = deal.lenders || [];
  const grouped: Record<Bucket, DealLender[]> = { reviewing: [], onhold: [], ondeck: [], passed: [] };
  for (const l of lenders) grouped[bucketOf(l)].push(l);
  const hasHidden = (['reviewing','onhold','ondeck','passed'] as Bucket[])
    .some(b => grouped[b].length > VISIBLE_PER_BUCKET);

  return (
    <div className="p-5 flex flex-col h-full min-w-0">
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
        <div className="space-y-3">
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
                    <div key={l.id} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span
                        className="flex-1 text-xs text-foreground truncate"
                        title={l.name}
                      >
                        {l.name}
                      </span>
                      <Badge variant={meta.badgeVariant} className="text-[9px] px-1.5 py-0 rounded-full">
                        {meta.pillLabel}
                      </Badge>
                    </div>
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