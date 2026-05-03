import { useMemo, useState } from 'react';
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

  const { value: thresholds, setValue: setThresholds } = useDashboardPreference<{
    inactivity: number;
    noActiveDeals: number;
  }>('referral_attention_thresholds', { inactivity: 30, noActiveDeals: 90 });

  const [editThresholds, setEditThresholds] = useState(thresholds);

  const stale = useMemo(() => {
    const now = new Date();
    const result: StaleReferral[] = [];

    referralSources.forEach(rs => {
      const latest = rs.deals[0];
      if (!latest) return;
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

  const displayed = showAll ? stale : stale.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Referrals Needing Attention</h3>
          {stale.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {stale.length}
            </Badge>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Settings className="h-3.5 w-3.5 text-slate-400" />
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
      </div>

      {stale.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 text-center">
          <p className="text-sm text-slate-400">All referral sources are active — no alerts right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(sr => (
            <div
              key={sr.key}
              className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{sr.name}</p>
                  <p className="text-xs text-slate-400 truncate">{sr.company || '—'} · {sr.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-400">{sr.daysSinceActivity}d ago</p>
                  <p className="text-[10px] text-slate-500">Last: {sr.lastActivityType}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setEditTarget(sr.entry)}
                >
                  <Eye className="h-3 w-3" /> View
                </Button>
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

      {editTarget && (
        <ReferralSourceEditDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          referredBy={editTarget.referredBy}
          initialCompany={editTarget.companyName}
        />
      )}
    </div>
  );
}