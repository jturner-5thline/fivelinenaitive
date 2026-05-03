import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRightLeft, Handshake, FileText, UserPlus, AlertTriangle, Filter,
  Clock, FileDown, Lightbulb,
} from 'lucide-react';
import { subDays, formatDistanceToNow, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { PartnerReportBuilder } from './PartnerReportBuilder';

type InsightType = 'stage_move' | 'new_deal' | 'memo_update' | 'new_partner' | 'stale_alert';
type TimePeriod = '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<TimePeriod, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' };
const PERIOD_DAYS: Record<TimePeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };

const TYPE_CONFIG: Record<InsightType, { label: string; icon: typeof ArrowRightLeft; color: string }> = {
  stage_move: { label: 'Pipeline Moves', icon: ArrowRightLeft, color: 'text-blue-400' },
  new_deal: { label: 'New Deals Referred', icon: Handshake, color: 'text-green-400' },
  memo_update: { label: 'Memo Updates', icon: FileText, color: 'text-purple-400' },
  new_partner: { label: 'New Partners', icon: UserPlus, color: 'text-cyan-400' },
  stale_alert: { label: 'Stale Alerts', icon: AlertTriangle, color: 'text-amber-400' },
};

interface InsightItem {
  id: string;
  type: InsightType;
  summary: string;
  userName?: string;
  timestamp: string;
  partnerId?: string;
}

export type InsightsSource = 'all' | 'partners' | 'referrals';

export function PartnerInsightsFeed({ sourceFilter = 'all' }: { sourceFilter?: InsightsSource } = {}) {
  const { company } = useCompany();
  const { user } = useAuth();
  const { data: partners = [] } = usePartners();
  const { data: stages = [] } = usePipelineStages();
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [activeTypes, setActiveTypes] = useState<Set<InsightType>>(
    new Set(['stage_move', 'new_deal', 'memo_update', 'new_partner', 'stale_alert'])
  );
  const [showReport, setShowReport] = useState(false);

  const cutoff = useMemo(() => subDays(new Date(), PERIOD_DAYS[period]).toISOString(), [period]);
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s.name])), [stages]);
  const partnerMap = useMemo(() => new Map(partners.map(p => [p.id, p.name])), [partners]);

  // Fetch profiles for user name resolution
  const { data: profiles = [] } = useQuery({
    queryKey: ['insight-profiles', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .not('display_name', 'is', null);
      return data || [];
    },
  });
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.user_id, p.display_name])), [profiles]);

  // Stage moves
  const { data: stageMoves = [] } = useQuery({
    queryKey: ['insights-stage-moves', company?.id, cutoff],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('partner_stage_notes' as any)
        .select('id, partner_id, user_id, from_stage, to_stage, note, created_at')
        .eq('company_id', company!.id)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Memo updates
  const { data: memoUpdates = [] } = useQuery({
    queryKey: ['insights-memo-updates', company?.id, cutoff],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('partner_memo_audit_log' as any)
        .select('id, partner_id, user_id, field_changed, changed_at')
        .eq('company_id', company!.id)
        .gte('changed_at', cutoff)
        .order('changed_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // New deals referred
  const { data: newDeals = [] } = useQuery({
    queryKey: ['insights-new-deals', company?.id, cutoff],
    enabled: !!company?.id,
    queryFn: async () => {
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();
      let query = supabase
        .from('deals')
        .select('id, company, value, referred_by, sourced_via, created_at, pipeline_id')
        .eq('company_id', company!.id)
        .gte('created_at', cutoff)
        .not('referred_by', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (naitivePipelineId) query = query.neq('pipeline_id', naitivePipelineId);
      const { data } = await query;
      return data || [];
    },
  });

  const insights = useMemo<InsightItem[]>(() => {
    const items: InsightItem[] = [];

    // Stage moves
    for (const m of stageMoves as any[]) {
      const pName = partnerMap.get(m.partner_id) || 'Unknown';
      const from = stageMap.get(m.from_stage) || m.from_stage || '?';
      const to = stageMap.get(m.to_stage) || m.to_stage || '?';
      items.push({
        id: `sm-${m.id}`,
        type: 'stage_move',
        summary: `${pName} moved from ${from} to ${to}`,
        userName: profileMap.get(m.user_id) || undefined,
        timestamp: m.created_at,
        partnerId: m.partner_id,
      });
    }

    // Memo updates
    for (const m of memoUpdates as any[]) {
      const pName = partnerMap.get(m.partner_id) || 'Unknown';
      items.push({
        id: `mu-${m.id}`,
        type: 'memo_update',
        summary: `${pName} memo — ${m.field_changed} updated`,
        userName: profileMap.get(m.user_id) || undefined,
        timestamp: m.changed_at,
        partnerId: m.partner_id,
      });
    }

    // New deals
    for (const d of newDeals) {
      const val = d.value ? `$${d.value >= 1000 ? `${(d.value / 1000).toFixed(0)}k` : d.value}` : '';
      items.push({
        id: `nd-${d.id}`,
        type: 'new_deal',
        summary: `${d.company} ${val} — referred by ${d.referred_by || d.sourced_via}`,
        timestamp: d.created_at,
      });
    }

    // New partners
    for (const p of partners) {
      if (p.created_at && p.created_at >= cutoff) {
        items.push({
          id: `np-${p.id}`,
          type: 'new_partner',
          summary: `${p.name} added to pipeline`,
          timestamp: p.created_at,
          partnerId: p.id,
        });
      }
    }

    // Stale partners (no stage note in 30+ days)
    const staleThreshold = subDays(new Date(), 30).toISOString();
    const latestByPartner = new Map<string, string>();
    for (const m of stageMoves as any[]) {
      const cur = latestByPartner.get(m.partner_id);
      if (!cur || m.created_at > cur) latestByPartner.set(m.partner_id, m.created_at);
    }
    for (const p of partners) {
      const last = latestByPartner.get(p.id);
      if (!last || last < staleThreshold) {
        items.push({
          id: `sa-${p.id}`,
          type: 'stale_alert',
          summary: `${p.name} — no activity in 30+ days`,
          timestamp: last || p.created_at || new Date().toISOString(),
          partnerId: p.id,
        });
      }
    }

    return items
      .filter(i => activeTypes.has(i.type))
      .filter(i => {
        if (sourceFilter === 'all') return true;
        if (sourceFilter === 'partners') {
          // Partner-anchored insight types
          return i.type === 'stage_move'
            || i.type === 'memo_update'
            || i.type === 'new_partner'
            || i.type === 'stale_alert'
            || (i.type === 'new_deal' && !!i.partnerId);
        }
        // referrals
        return i.type === 'new_deal' && !i.partnerId;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [stageMoves, memoUpdates, newDeals, partners, cutoff, activeTypes, partnerMap, stageMap, profileMap, sourceFilter]);

  const toggleType = (t: InsightType) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Partner Insights</h3>
          <Badge variant="secondary" className="text-xs">{insights.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Time period */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(Object.entries(PERIOD_LABELS) as [TimePeriod, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-3.5 w-3.5" /> Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52">
              <p className="text-xs font-medium text-muted-foreground mb-2">Insight Types</p>
              <div className="space-y-2">
                {(Object.entries(TYPE_CONFIG) as [InsightType, typeof TYPE_CONFIG.stage_move][]).map(([key, cfg]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={activeTypes.has(key)} onCheckedChange={() => toggleType(key)} />
                    <cfg.icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    {cfg.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Draft Report */}
          <Button size="sm" className="gap-1.5" onClick={() => setShowReport(true)}>
            <FileDown className="h-3.5 w-3.5" /> Draft Report
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-[420px] overflow-y-auto">
        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Lightbulb className="h-8 w-8 opacity-30" />
            <p className="text-sm">No insights for this period.</p>
          </div>
        ) : (
          insights.slice(0, 50).map(item => {
            const cfg = TYPE_CONFIG[item.type];
            const Icon = cfg.icon;
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{item.summary}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {item.userName && <span>{item.userName}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showReport && (
        <PartnerReportBuilder
          open={showReport}
          onClose={() => setShowReport(false)}
          insights={insights}
          period={period}
        />
      )}
    </div>
  );
}
