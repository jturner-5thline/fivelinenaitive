import { useMemo, useState } from 'react';
import { useReferralSources } from '@/hooks/useReferralSources';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { ReferralSourceDealsDialog } from '@/components/partners/ReferralSourceDealsDialog';

const DAY = 86_400_000;

export function NewlyAddedSources() {
  const { referralSources, isLoading } = useReferralSources();
  const members = useTeamMembers();
  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.display_name])), [members]);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY;
    return referralSources
      .filter((s) => s.created_at && new Date(s.created_at).getTime() >= cutoff)
      .sort((a, b) => (b.created_at! > a.created_at! ? 1 : -1));
  }, [referralSources]);

  return (
    <section className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-2 min-w-0 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">Newly Added</p>
        <span className="text-[10px] text-muted-foreground" title="Added to the referral source pipeline in the past 30 days">
          {rows.length} · last 30 days
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border lg:min-h-0 lg:overflow-y-auto">
        {isLoading ? (
          <p className="py-3 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">No sources added in the past 30 days</p>
        ) : (
          rows.map((s) => {
            const days = Math.floor((Date.now() - new Date(s.created_at!).getTime()) / DAY);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpen(s.name)}
                className="flex items-center justify-between gap-3 py-1.5 text-left hover:opacity-80 transition-opacity"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{s.name}</p>
                  {s.company && <p className="truncate text-[11px] text-muted-foreground">{s.company}</p>}
                  <p className="truncate text-[10px] text-muted-foreground">
                    Added by {(s.user_id && nameById.get(s.user_id)) || 'Unknown'}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {days < 1 ? 'Today' : `${days}d ago`}
                </span>
              </button>
            );
          })
        )}
      </div>
      <ReferralSourceDealsDialog name={open} open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} />
    </section>
  );
}
