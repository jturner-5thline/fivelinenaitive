import type { Deal, DealLender } from '@/types/deal';
import { Badge } from '@/components/ui/badge';

interface LendersPanelProps {
  deal: Deal;
}

type Bucket = 'active' | 'ondeck' | 'passed';

function bucketOf(l: DealLender): Bucket {
  const ts = (l.trackingStatus || '').toLowerCase();
  if (ts === 'passed') return 'passed';
  if (ts === 'on-deck' || ts === 'ondeck') return 'ondeck';
  return 'active';
}

const BUCKET_META: Record<
  Bucket,
  { label: string; dot: string; badgeVariant: 'green' | 'amber' | 'gray' }
> = {
  active: { label: 'Active', dot: 'bg-emerald-500', badgeVariant: 'green' },
  ondeck: { label: 'On Deck', dot: 'bg-amber-500', badgeVariant: 'amber' },
  passed: { label: 'Passed', dot: 'bg-muted-foreground', badgeVariant: 'gray' },
};

export function LendersPanel({ deal }: LendersPanelProps) {
  const lenders = deal.lenders || [];
  const grouped: Record<Bucket, DealLender[]> = { active: [], ondeck: [], passed: [] };
  for (const l of lenders) grouped[bucketOf(l)].push(l);

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        Lenders
      </div>

      {lenders.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No lenders engaged.</p>
      ) : (
        <div className="overflow-y-auto pr-1 space-y-3 max-h-[280px] lg:max-h-[340px]">
          {(['active', 'ondeck', 'passed'] as Bucket[]).map(b => {
            const items = grouped[b];
            if (items.length === 0) return null;
            const meta = BUCKET_META[b];
            return (
              <div key={b}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label} · {items.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map(l => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40 border border-border/60"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span
                        className="flex-1 text-xs text-foreground font-medium truncate"
                        title={l.name}
                      >
                        {l.name}
                      </span>
                      {l.stage && (
                        <Badge variant={meta.badgeVariant} className="text-[9px] px-1.5 py-0">
                          {l.stage}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}