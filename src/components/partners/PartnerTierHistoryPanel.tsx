import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { usePartnerTierHistory } from '@/hooks/usePartnerTierHistory';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function tierLabel(t: number | null | undefined) {
  if (t == null) return '—';
  return `Tier ${t}`;
}

function sourceLabel(source: string) {
  switch (source) {
    case 'auto': return 'Auto (thresholds)';
    case 'manual_override': return 'Manual override';
    case 'override_cleared': return 'Override cleared';
    default: return source;
  }
}

function crossedSummary(entry: {
  from_tier: number | null;
  to_tier: number;
  thresholds: Record<string, any> | null;
}) {
  const t = entry.thresholds || {};
  const bits: string[] = [];
  if (typeof t.qualifiedTrailing3mo === 'number') bits.push(`${t.qualifiedTrailing3mo} qualified (3mo)`);
  if (typeof t.signedTrailing3mo === 'number') bits.push(`${t.signedTrailing3mo} signed (3mo)`);
  if (typeof t.addedToBoardTrailing12mo === 'number') bits.push(`${t.addedToBoardTrailing12mo} on board (12mo)`);
  if (typeof t.totalDeals === 'number') bits.push(`${t.totalDeals} total`);
  return bits.join(' · ');
}

export function PartnerTierHistoryPanel({ partnerId }: { partnerId: string }) {
  const [open, setOpen] = useState(false);
  const { data: history = [], isLoading } = usePartnerTierHistory(partnerId);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          <span className="text-xs font-medium text-slate-200 uppercase tracking-wider">Tier History</span>
          <span className="text-[10px] text-slate-500">({history.length})</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {isLoading ? (
            <p className="text-[11px] text-slate-500">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-[11px] text-slate-500">No tier changes recorded yet. Entries appear the first time the tier is computed and every time it moves.</p>
          ) : (
            <ol className="relative border-l border-slate-700 ml-2 space-y-3">
              {history.map(entry => (
                <li key={entry.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary/70" />
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="text-xs text-white">
                      <span className="text-slate-400">{tierLabel(entry.from_tier)}</span>
                      <span className="mx-1 text-slate-500">→</span>
                      <span className="font-medium">{tierLabel(entry.to_tier)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {format(new Date(entry.created_at), 'MMM d, yyyy · h:mm a')}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{sourceLabel(entry.source)}</span>
                    {entry.changed_by_email && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span>by {entry.changed_by_email}</span>
                      </>
                    )}
                    {entry.thresholds && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300">
                            <Info className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 bg-slate-900 border-slate-700 text-white text-xs">
                          <div className="font-medium mb-1">Thresholds crossed</div>
                          <p className="text-slate-400">{crossedSummary(entry) || 'No threshold snapshot recorded.'}</p>
                          {entry.reason && (
                            <p className="text-slate-300 mt-2"><span className="text-slate-500">Reason:</span> {entry.reason}</p>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  {entry.reason && !entry.thresholds && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{entry.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}