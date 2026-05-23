import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { AlertTriangle, Settings, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { differenceInDays, format } from 'date-fns';
import { liquidGlassCard, liquidGlassSectionTitle } from '@/components/metrics/liquidGlass';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';

interface StalePartner {
  id: string;
  name: string;
  stageName: string;
  daysSinceActivity: number;
  lastActivityType: string;
  reason: string;
}

export function ReEngagementInsights({ onViewPartner }: { onViewPartner?: (partnerId: string) => void }) {
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = dateCtx?.start ?? null;
  const rangeEnd = dateCtx?.end ?? null;
  const granularity = dateCtx?.range.granularity ?? null;
  const { data: partners = [] } = usePartners({ start: rangeStart, end: rangeEnd, granularity });
  const { data: stages = [] } = usePipelineStages();
  const { company } = useCompany();
  const [showAll, setShowAll] = useState(false);

  const { value: thresholds, setValue: setThresholds } = useDashboardPreference<{
    inactivity: number;
    nurturing: number;
    noDeals: number;
  }>('reengagement_thresholds', { inactivity: 30, nurturing: 60, noDeals: 90 });

  const [editThresholds, setEditThresholds] = useState(thresholds);

  // Get latest stage notes for each partner (proxy for last activity)
  const { data: stageNotes = [] } = useQuery({
    queryKey: ['partner_stage_notes_latest', company?.id, rangeStart?.toISOString() ?? null, rangeEnd?.toISOString() ?? null, granularity],
    enabled: !!company?.id,
    queryFn: async () => {
      let query = supabase
        .from('partner_stage_notes' as any)
        .select('partner_id, created_at, to_stage')
        .eq('company_id', company!.id);
      if (rangeStart) query = query.gte('created_at', rangeStart.toISOString());
      if (rangeEnd) query = query.lte('created_at', rangeEnd.toISOString());
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as { partner_id: string; created_at: string; to_stage: string }[];
    },
  });

  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s.name])), [stages]);

  const stalePartners = useMemo(() => {
    const now = new Date();
    const result: StalePartner[] = [];
    const latestNoteByPartner = new Map<string, { created_at: string; to_stage: string }>();

    stageNotes.forEach(n => {
      if (!latestNoteByPartner.has(n.partner_id)) {
        latestNoteByPartner.set(n.partner_id, n);
      }
    });

    partners.forEach(p => {
      const stageName = stageMap.get(p.stage_id || '') || 'Unknown';
      const latestNote = latestNoteByPartner.get(p.id);
      const lastDate = latestNote ? new Date(latestNote.created_at) : new Date(p.created_at);
      const daysSince = differenceInDays(now, lastDate);

      // Rule 1: No activity in threshold days
      if (daysSince >= thresholds.inactivity) {
        result.push({
          id: p.id,
          name: p.name,
          stageName,
          daysSinceActivity: daysSince,
          lastActivityType: latestNote ? 'Stage move' : 'Created',
          reason: `No activity in ${daysSince} days`,
        });
        return;
      }

      // Rule 2: Stuck in nurturing
      if (stageName.toLowerCase().includes('nurturing')) {
        const stageEnterDate = latestNote ? new Date(latestNote.created_at) : new Date(p.created_at);
        const daysInStage = differenceInDays(now, stageEnterDate);
        if (daysInStage >= thresholds.nurturing) {
          result.push({
            id: p.id,
            name: p.name,
            stageName,
            daysSinceActivity: daysInStage,
            lastActivityType: 'Stuck in stage',
            reason: `In Nurturing for ${daysInStage} days`,
          });
        }
      }
    });

    return result.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  }, [partners, stageNotes, stageMap, thresholds]);

  const displayed = showAll ? stalePartners : stalePartners.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className={liquidGlassSectionTitle}>Partners Needing Attention</h3>
          {stalePartners.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {stalePartners.length}
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
                <Label className="text-xs">No activity (days)</Label>
                <Input
                  type="number"
                  value={editThresholds.inactivity}
                  onChange={e => setEditThresholds(prev => ({ ...prev, inactivity: +e.target.value }))}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stuck in Nurturing (days)</Label>
                <Input
                  type="number"
                  value={editThresholds.nurturing}
                  onChange={e => setEditThresholds(prev => ({ ...prev, nurturing: +e.target.value }))}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">No deals referred (days)</Label>
                <Input
                  type="number"
                  value={editThresholds.noDeals}
                  onChange={e => setEditThresholds(prev => ({ ...prev, noDeals: +e.target.value }))}
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

      {stalePartners.length === 0 ? (
        <div className={`${liquidGlassCard} p-6 text-center`}>
          <p className="text-sm text-muted-foreground">All partners are active — no alerts right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(sp => (
            <div
              key={sp.id}
              className={`${liquidGlassCard} flex items-center justify-between px-4 py-3 transition-colors`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{sp.name}</p>
                  <p className="text-xs text-muted-foreground">{sp.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">{sp.stageName}</p>
                  <p className="text-[10px] text-muted-foreground/70">Last: {sp.lastActivityType}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onViewPartner?.(sp.id)}
                >
                  <Eye className="h-3 w-3" /> View
                </Button>
              </div>
            </div>
          ))}

          {stalePartners.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors pt-1"
            >
              {showAll ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {showAll ? 'Show less' : `Show all ${stalePartners.length} alerts`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
