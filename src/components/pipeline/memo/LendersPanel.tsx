import type { Deal, DealLender } from '@/types/deal';

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

const BUCKET_META: Record<Bucket, { label: string; dot: string; tagBg: string; tagText: string }> = {
  active:  { label: 'Active',   dot: 'bg-[#1a7a52]', tagBg: 'bg-[#1a7a52]/10 border-[#1a7a52]/25', tagText: 'text-[#1a7a52]' },
  ondeck:  { label: 'On Deck',  dot: 'bg-[#9a6800]', tagBg: 'bg-[#9a6800]/10 border-[#9a6800]/25', tagText: 'text-[#9a6800]' },
  passed:  { label: 'Passed',   dot: 'bg-[#7a9aaa]', tagBg: 'bg-white/55 border-white/70',         tagText: 'text-[#4a6070]' },
};

export function LendersPanel({ deal }: LendersPanelProps) {
  const lenders = deal.lenders || [];
  const grouped: Record<Bucket, DealLender[]> = { active: [], ondeck: [], passed: [] };
  for (const l of lenders) grouped[bucketOf(l)].push(l);

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a9aaa] mb-3">
        Lenders
      </div>

      {lenders.length === 0 ? (
        <p className="text-[12px] text-[#4a6070] font-light italic">No lenders engaged.</p>
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
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#4a6070]">
                    {meta.label} · {items.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map(l => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/40 border border-white/55"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="flex-1 text-[12px] text-[#1a2b38] font-medium truncate" title={l.name}>
                        {l.name}
                      </span>
                      {l.stage && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border whitespace-nowrap ${meta.tagBg} ${meta.tagText}`}>
                          {l.stage}
                        </span>
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