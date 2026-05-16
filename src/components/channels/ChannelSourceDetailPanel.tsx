import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Handshake, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { usePartnerTier } from '@/hooks/usePartnerTier';
import { PartnerTierBadge, PartnerTier4WarningBadge } from '@/components/partners/PartnerTierBadge';
import { liquidGlassCard } from '@/components/metrics/liquidGlass';
import { channelLabel } from './channelOptions';
import { toast } from 'sonner';
import { formatSlug } from '@/utils/dealTypeLabels';
import { useNavigate } from 'react-router-dom';

export type SourceTarget =
  | { kind: 'individual'; name: string; channelType?: string | null; companyName?: string | null }
  | { kind: 'company'; name: string; channelType?: string | null }
  | { kind: 'channel'; channelType: string };

const SIGNED_STAGES = ['final-credit-items', 'closed-won', 'funded-invoiced', 'terms-issued', 'agreement-pending', 'funded'];
const PROPOSAL_STAGES = ['proposal-issued'];

function fmt$(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function classifyStage(stage: string): 'added' | 'proposal' | 'signed' | 'funded' {
  const s = (stage || '').toLowerCase();
  if (/funded|invoiced/.test(s) && !/not/.test(s)) return 'funded';
  if (SIGNED_STAGES.includes(s)) return 'signed';
  if (PROPOSAL_STAGES.includes(s) || /proposal.issued/.test(s)) return 'proposal';
  return 'added';
}

export function ChannelSourceDetailPanel({
  target,
  open,
  onClose,
}: {
  target: SourceTarget | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { company } = useCompany();
  const qc = useQueryClient();
  const { data: partners = [] } = usePartners();
  const { data: stages = [] } = usePipelineStages();

  // Build "name list" of values to query by referred_by/sourced_via
  const queryKey = ['channel_source_drill', company?.id, target];
  const { data: deals = [], isLoading } = useQuery({
    queryKey,
    enabled: !!company?.id && !!target && open,
    queryFn: async () => {
      if (!target) return [];
      let q = supabase
        .from('deals')
        .select('id, company_name, value, stage, referred_by, sourced_via, created_at, closing_date, pipeline_id')
        .eq('company_id', company!.id);
      if (target.kind === 'channel') {
        // No direct field; we'll filter client-side via name match through channel_entries
        const { data: ces } = await supabase
          .from('channel_entries')
          .select('contact_id, crm_company_id, channel_type, contact:contacts(full_name), crm_company:crm_companies(name)')
          .eq('company_id', company!.id)
          .eq('channel_type', target.channelType as any);
        const names = (ces || [])
          .flatMap((c: any) => [c.contact?.full_name, c.crm_company?.name])
          .filter(Boolean) as string[];
        if (names.length === 0) return [];
        const ors = names.map(n => `referred_by.ilike.${n},sourced_via.ilike.${n}`).join(',');
        q = q.or(ors);
      } else {
        const n = target.name;
        q = q.or(`referred_by.ilike.${n},sourced_via.ilike.${n}`);
      }
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  const now = Date.now();
  const winMs = (m: number) => now - m * 30 * 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const buckets = { added: 0, proposal: 0, signed: 0, funded: 0 };
    const revenue = { '3m': 0, '6m': 0, '12m': 0 };
    let active = 0;
    deals.forEach((d: any) => {
      const k = classifyStage(d.stage || '');
      // Reached stage = all earlier counts include this deal
      if (k === 'funded') buckets.funded += 1;
      if (k === 'funded' || k === 'signed') buckets.signed += 1;
      if (k !== 'added') buckets.proposal += 1;
      buckets.added += 1;
      // Revenue windows by closing/created date for signed+
      if (k === 'signed' || k === 'funded') {
        const t = new Date(d.closing_date || d.created_at).getTime();
        if (t >= winMs(3)) revenue['3m'] += d.value || 0;
        if (t >= winMs(6)) revenue['6m'] += d.value || 0;
        if (t >= winMs(12)) revenue['12m'] += d.value || 0;
      }
      // Active = not signed/funded yet
      if (k !== 'funded' && k !== 'signed') active += 1;
    });
    return { buckets, revenue, active };
  }, [deals]);

  // Tier from partner record if this individual is already a partner
  const partnerMatch = useMemo(() => {
    if (!target || target.kind === 'channel') return null;
    const n = target.name.toLowerCase().trim();
    return partners.find(p => p.name.toLowerCase().trim() === n) || null;
  }, [partners, target]);
  const { data: tierInfo } = usePartnerTier(partnerMatch);

  const currentStageInfo = useMemo(() => {
    if (!partnerMatch) return null;
    const stage = stages.find(s => s.id === partnerMatch.stage_id);
    const daysInStage = Math.max(
      0,
      Math.floor((Date.now() - new Date(partnerMatch.updated_at).getTime()) / (24 * 60 * 60 * 1000)),
    );
    return { stageName: stage?.name || '—', daysInStage };
  }, [partnerMatch, stages]);

  const [moving, setMoving] = useState(false);
  const handleMoveToPartners = async () => {
    if (!target || target.kind === 'channel' || !company?.id) return;
    setMoving(true);
    try {
      const firstStage = [...stages].sort((a, b) => a.sort_order - b.sort_order)[0];
      const { error } = await supabase.from('partners' as any).insert({
        company_id: company.id,
        name: target.name,
        firm_type: target.kind === 'company' ? 'Channel' : 'Connector',
        stage_id: firstStage?.id || null,
        notes: target.channelType ? `Moved from Channels (${channelLabel(target.channelType)})` : 'Moved from Channels',
        metadata: { movedFromChannels: { at: new Date().toISOString(), channelType: target.channelType || null } },
      });
      if (error) throw error;
      toast.success(`${target.name} added to Partners Pipeline`);
      qc.invalidateQueries({ queryKey: ['partners'] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add partner');
    } finally {
      setMoving(false);
    }
  };

  if (!target) return null;

  const title =
    target.kind === 'channel'
      ? `Channel — ${channelLabel(target.channelType)}`
      : `${target.kind === 'company' ? 'Company' : 'Source'} — ${target.name}`;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {target.channelType && target.kind !== 'channel' && (
              <Badge variant="secondary" className="text-[10px]">{channelLabel(target.channelType)}</Badge>
            )}
            <PartnerTierBadge info={tierInfo} size="md" />
            <PartnerTier4WarningBadge info={tierInfo} />
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            {/* Stage breakdown */}
            <div className={`${liquidGlassCard} p-4`}>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Referrals sent — by stage reached</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { k: 'added', label: 'Added to Board', v: stats.buckets.added },
                  { k: 'proposal', label: 'Proposal Issued', v: stats.buckets.proposal },
                  { k: 'signed', label: 'Signed', v: stats.buckets.signed },
                  { k: 'funded', label: 'Funded', v: stats.buckets.funded },
                ].map(c => (
                  <div key={c.k} className="rounded-md border border-slate-700 bg-slate-800/40 p-2 text-center">
                    <p className="text-2xl font-bold font-mono tabular-nums text-foreground">{c.v}</p>
                    <p className="text-[10px] text-muted-foreground">{c.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue windows */}
            <div className={`${liquidGlassCard} p-4`}>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Revenue attributed (signed)</p>
              <div className="grid grid-cols-3 gap-2">
                {(['3m', '6m', '12m'] as const).map(w => (
                  <div key={w} className="rounded-md border border-slate-700 bg-slate-800/40 p-2 text-center">
                    <p className="text-lg font-bold font-mono tabular-nums text-foreground">{fmt$(stats.revenue[w])}</p>
                    <p className="text-[10px] text-muted-foreground">Trailing {w.toUpperCase()}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Partner pipeline state */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`${liquidGlassCard} p-3`}>
                <p className="text-[10px] text-muted-foreground uppercase">Partner pipeline stage</p>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {currentStageInfo ? currentStageInfo.stageName : 'Not in pipeline'}
                </p>
                {currentStageInfo && (
                  <p className="text-[10px] text-muted-foreground">{currentStageInfo.daysInStage}d in current stage</p>
                )}
              </div>
              <div className={`${liquidGlassCard} p-3`}>
                <p className="text-[10px] text-muted-foreground uppercase">Active deals in progress</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{stats.active}</p>
              </div>
            </div>

            {/* Active deals list (top 5) */}
            {deals.length > 0 && (
              <div className={`${liquidGlassCard} overflow-hidden`}>
                <div className="p-3 border-b border-slate-700 text-xs text-muted-foreground">
                  Deals ({deals.length})
                </div>
                <div className="max-h-48 overflow-auto divide-y divide-slate-800">
                  {deals.slice(0, 25).map((d: any) => (
                    <button
                      key={d.id}
                      onClick={() => navigate(`/deal/${d.id}`)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-800/60 text-xs"
                    >
                      <div className="min-w-0 text-left">
                        <p className="text-foreground font-medium truncate">{d.company_name || 'Untitled'}</p>
                        <p className="text-[10px] text-muted-foreground">{formatSlug(d.stage || '')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums">{fmt$(d.value || 0)}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              {target.kind !== 'channel' && !partnerMatch && (
                <Button onClick={handleMoveToPartners} disabled={moving} className="gap-1.5">
                  {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Handshake className="h-3.5 w-3.5" />}
                  Move to Partners Pipeline
                </Button>
              )}
              {partnerMatch && (
                <Badge variant="secondary" className="self-center">
                  Already in Partners Pipeline
                </Badge>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}