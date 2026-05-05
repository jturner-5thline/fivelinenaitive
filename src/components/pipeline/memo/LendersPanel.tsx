import type { Deal, DealLender } from '@/types/deal';
import { Badge } from '@/components/ui/badge';

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
  const lenders = deal.lenders || [];
  const grouped: Record<Bucket, DealLender[]> = { reviewing: [], onhold: [], ondeck: [], passed: [] };
  for (const l of lenders) grouped[bucketOf(l)].push(l);

  return (
    <div className="p-5 flex flex-col h-full min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        Lenders
      </div>

      {lenders.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No lenders engaged.</p>
      ) : (
        <div className="space-y-3">
          {(['reviewing', 'onhold', 'ondeck', 'passed'] as Bucket[]).map(b => {
            const items = grouped[b];
            if (items.length === 0) return null;
            const meta = BUCKET_META[b];
            const shown = items.slice(0, VISIBLE_PER_BUCKET);
            const hidden = items.slice(VISIBLE_PER_BUCKET);
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
                    <div className="text-[10px] text-muted-foreground italic pl-3.5 truncate">
                      {hidden.slice(0, 2).map(l => l.name).join(', ')}
                      {hidden.length > 2 ? ` + ${hidden.length - 2} more` : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}