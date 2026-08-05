import { useEffect, useMemo, useState } from 'react';
import { useDealReferralSources, type DealReferralSourceEntry } from '@/hooks/useDealReferralSources';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { AlertTriangle, Settings, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { differenceInDays } from 'date-fns';
import { ReferralSourceEditDialog } from '@/components/channels/ReferralSourceEditDialog';
import { ContactLookupDialog } from '@/components/contacts/ContactLookupDialog';
import { liquidGlassCard, liquidGlassSectionTitle } from '@/components/metrics/liquidGlass';
import { usePartnerInsightsCounts } from './PartnerInsightsFeed';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';

interface StaleReferral {
  key: string;
  name: string;
  company: string | null;
  daysSinceActivity: number;
  lastActivityType: string;
  reason: string;
  hasActiveDeals: boolean;
  entry: DealReferralSourceEntry;
}

export function ReferralsNeedingAttention() {
  const { referralSources } = useDealReferralSources();
  const [showAll, setShowAll] = useState(false);
  const [editTarget, setEditTarget] = useState<DealReferralSourceEntry | null>(null);
  const [contactLookup, setContactLookup] = useState<{ name: string } | null>(null);

  const { value: thresholds, setValue: setThresholds } = useDashboardPreference<{
    inactivity: number;
    noActiveDeals: number;
  }>('referral_attention_thresholds', { inactivity: 30, noActiveDeals: 90 });

  const [editThresholds, setEditThresholds] = useState(thresholds);

  const stale = useMemo(() => {
    // Absolute across all time — ignore the Sales & BD timeframe selector.
    const now = new Date();
    const result: StaleReferral[] = [];

    referralSources.forEach(rs => {
      if (rs.deals.length === 0) return;
      const latest = rs.deals[0];
      const lastDate = new Date(latest.created_at);
      const daysSince = differenceInDays(now, lastDate);
      const hasActive = rs.deals.some(d => d.status === 'active');

      if (daysSince >= thresholds.inactivity) {
        result.push({
          key: rs.referredBy,
          name: rs.referredBy,
          company: rs.companyName,
          daysSinceActivity: daysSince,
          lastActivityType: 'Deal referral',
          reason: `No new referrals in ${daysSince} days`,
          hasActiveDeals: hasActive,
          entry: rs,
        });
        return;
      }

      if (!hasActive && daysSince >= thresholds.noActiveDeals) {
        result.push({
          key: rs.referredBy,
          name: rs.referredBy,
          company: rs.companyName,
          daysSinceActivity: daysSince,
          lastActivityType: 'Deal referral',
          reason: `No active deals in pipeline (${daysSince}d)`,
          hasActiveDeals: false,
          entry: rs,
        });
      }
    });

    return result.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  }, [referralSources, thresholds]);

  const countsCtx = usePartnerInsightsCounts();
  useEffect(() => {
    if (countsCtx) countsCtx.setAttentionCount(stale.length);
  }, [stale.length, countsCtx]);

  const displayed = showAll ? stale : stale.slice(0, 5);

  const settingsPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Thresholds">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="text-xs font-medium text-slate-400 mb-3">Inactivity Thresholds</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">No referrals (days)</Label>
            <Input
              type="number"
              value={editThresholds.inactivity}
              onChange={e => setEditThresholds(prev => ({ ...prev, inactivity: +e.target.value }))}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">No active deals (days)</Label>
            <Input
              type="number"
              value={editThresholds.noActiveDeals}
              onChange={e => setEditThresholds(prev => ({ ...prev, noActiveDeals: +e.target.value }))}
              className="h-8"
            />
          </div>
          <Button size="sm" className="w-full" onClick={() => setThresholds(editThresholds)}>
            Save Thresholds
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
  useEffect(() => {
    if (!countsCtx) return;
    countsCtx.setSettingsNode(settingsPopover);
    return () => countsCtx.setSettingsNode(null);
  }, [countsCtx, editThresholds]);

  return (
    <div>
      {stale.length === 0 ? (
        <div className={`${liquidGlassCard} p-6 text-center`}>
          <p className="text-sm text-muted-foreground">All referral sources are active — no alerts right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(sr => (
            <div
              key={sr.key}
              className={`${liquidGlassCard} flex items-center justify-between px-4 py-3 transition-colors hover:border-primary/30 cursor-pointer`}
              role="button"
              tabIndex={0}
              onClick={() => setContactLookup({ name: sr.name })}
              onKeyDown={(e) => { if (e.key === 'Enter') setContactLookup({ name: sr.name }); }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{sr.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{sr.company || '—'} · {sr.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">{sr.daysSinceActivity}d ago</p>
                  <p className="text-[10px] text-muted-foreground/70">Last: {sr.lastActivityType}</p>
                </div>
              </div>
            </div>
          ))}

          {stale.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors pt-1"
            >
              {showAll ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {showAll ? 'Show less' : `Show all ${stale.length} alerts`}
            </button>
          )}
        </div>
      )}

      <ReferralSourceEditDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setTimeout(() => setEditTarget(null), 200); }}
        referredBy={editTarget?.referredBy ?? ''}
        initialCompany={editTarget?.companyName}
      />
      {contactLookup && (
        <ContactLookupDialog
          name={contactLookup.name}
          onClose={() => setContactLookup(null)}
        />
      )}
    </div>
  );
}