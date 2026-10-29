import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import { ReferralEntityQuickView } from '@/components/channels/ReferralEntityQuickView';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useDealStages } from '@/contexts/DealStagesContext';
import { partnerMatches } from '@/lib/partnerNameMatch';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const isNdaStage = (s: string | null | undefined) => {
  const v = (s || '').toLowerCase();
  return v.includes('nda') && (v.includes('needs') || v.includes('ndaneeds'));
};

const humanize = (s: string) =>
  s.includes('-') && s === s.toLowerCase()
    ? s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : s;

interface Row {
  id: string;
  company: string | null;
  stage: string | null;
  value: number | null;
  referredAt: string;
  fromNda: boolean;
  note: string | null;
  noteAt: string | null;
}

export function ReferralSourceDealsDialog({
  name,
  open,
  onOpenChange,
}: {
  name: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { company } = useCompany();
  const { getStageConfig } = useDealStages();
  const stageCfg = getStageConfig();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['referral_source_deals_dialog', company?.id, name],
    enabled: open && !!company?.id && !!name,
    queryFn: async (): Promise<Row[]> => {
      const { data: deals, error } = await supabase
        .from('deals')
        .select('id, company, stage, value, referred_by, sourced_via, created_at')
        .eq('company_id', company!.id)
        .or('referred_by.not.is.null,sourced_via.not.is.null');
      if (error) throw error;
      const matched = (deals || []).filter(
        d => partnerMatches(name!, d.referred_by) || partnerMatches(name!, d.sourced_via),
      );
      if (matched.length === 0) return [];
      const ids = matched.map(d => d.id);

      const [{ data: hist }, { data: notes }] = await Promise.all([
        supabase.from('deal_stage_history').select('deal_id, to_stage, changed_at').in('deal_id', ids),
        supabase
          .from('deal_status_notes')
          .select('deal_id, note, created_at')
          .in('deal_id', ids)
          .order('created_at', { ascending: false }),
      ]);

      const ndaAt = new Map<string, string>();
      for (const h of hist || []) {
        if (!isNdaStage(h.to_stage) || !h.changed_at) continue;
        const prev = ndaAt.get(h.deal_id);
        if (!prev || h.changed_at < prev) ndaAt.set(h.deal_id, h.changed_at);
      }
      const latestNote = new Map<string, { note: string; created_at: string }>();
      for (const n of notes || []) if (!latestNote.has(n.deal_id)) latestNote.set(n.deal_id, n);

      return matched
        .map(d => {
          const nda = ndaAt.get(d.id);
          const n = latestNote.get(d.id);
          return {
            id: d.id,
            company: d.company,
            stage: d.stage,
            value: d.value,
            referredAt: nda || d.created_at,
            fromNda: !!nda,
            note: n ? htmlToPlainText(n.note) : null,
            noteAt: n?.created_at ?? null,
          };
        })
        .sort((a, b) => b.referredAt.localeCompare(a.referredAt));
    },
  });

  // Resolve the contact record behind this referral source: the linked
  // referral_sources.contact_id first, then an exact name match in contacts.
  const { data: contactId } = useQuery({
    queryKey: ['referral_source_contact_id', company?.id, name],
    enabled: open && !!company?.id && !!name,
    queryFn: async (): Promise<string | null> => {
      const { data: rs } = await supabase
        .from('referral_sources')
        .select('contact_id')
        .eq('company_id', company!.id)
        .ilike('name', name!)
        .not('contact_id', 'is', null)
        .limit(1);
      if (rs?.[0]?.contact_id) return rs[0].contact_id as string;
      const bare = name!.split(/\s*(?:@|\s-\s)\s*/)[0].trim();
      const { data: c } = await supabase
        .from('contacts')
        .select('id')
        .eq('org_company_id', company!.id)
        .ilike('full_name', bare)
        .limit(1);
      return c?.[0]?.id ?? null;
    },
  });

  const [showContact, setShowContact] = useState(false);
  const queryClient = useQueryClient();

  // Channel Partner flag lives on the referral_sources row (matched by name).
  const { data: cpRow } = useQuery({
    queryKey: ['referral_source_cp_flag', company?.id, name],
    enabled: open && !!company?.id && !!name,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, is_channel_partner')
        .eq('company_id', company!.id)
        .ilike('name', name!)
        .order('is_channel_partner', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const [cpSaving, setCpSaving] = useState(false);
  const toggleChannelPartner = async (on: boolean) => {
    if (!company?.id || !name) return;
    setCpSaving(true);
    try {
      if (cpRow?.id) {
        const { error } = await supabase.from('referral_sources').update({ is_channel_partner: on }).eq('id', cpRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('referral_sources').insert({
          company_id: company.id, name, user_id: (await supabase.auth.getUser()).data.user?.id ?? null, is_channel_partner: on, contact_id: contactId ?? null,
        });
        if (error) throw error;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['referral_source_cp_flag'] }),
        queryClient.invalidateQueries({ queryKey: ['channel_partner_referral_sources'] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update Channel Partner');
    } finally {
      setCpSaving(false);
    }
  };
  const totalVolume = rows.reduce((s, r) => s + (r.value || 0), 0);
  const lastAt = rows[0]?.referredAt;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle>{name}</DialogTitle>
            <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Switch
                checked={!!cpRow?.is_channel_partner}
                disabled={cpSaving}
                onCheckedChange={toggleChannelPartner}
                aria-label="Channel Partner"
                className="scale-75"
              />
              Channel Partner
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              disabled={!contactId}
              title={contactId ? 'Open full contact details' : 'No linked contact record'}
              onClick={() => setShowContact(true)}
            >
              <Maximize2 className="h-3 w-3" /> Contact details
            </Button>
            </div>
          </div>
          <DialogDescription>
            {isLoading ? 'Loading referred deals…' : `${rows.length} referred deal${rows.length === 1 ? '' : 's'}`}
          </DialogDescription>
        </DialogHeader>
        {!isLoading && rows.length > 0 && (
          <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 p-2.5 text-center">
            <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Deals</p><p className="font-mono text-sm tabular-nums">{rows.length}</p></div>
            <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Volume</p><p className="font-mono text-sm tabular-nums">{formatUSDFromDollars(totalVolume)}</p></div>
            <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Last deal</p><p className="font-mono text-sm tabular-nums">{lastAt ? format(new Date(lastAt), 'MMM d, yyyy') : '—'}</p></div>
          </div>
        )}
        <div className="flex flex-col divide-y divide-border">
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No referred deals yet.</p>
          )}
          {rows.map(r => (
            <div key={r.id} className="py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={`/deals?deal=${r.id}`}
                  className="text-sm font-medium text-foreground hover:underline truncate"
                >
                  {r.company || 'Untitled deal'}
                </a>
                <span className="shrink-0 rounded-md bg-[var(--bg-chip)] px-2 py-0.5 text-[11px] text-foreground">
                  {r.stage ? stageCfg[r.stage]?.label || humanize(r.stage) : 'No stage'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Referred{' '}
                <span className="font-mono tabular-nums text-foreground/90">
                  {format(new Date(r.referredAt), 'MMM d, yyyy')}
                </span>
                {r.fromNda ? ' · entered NDA/Needs List Sent' : ' · date added (no NDA/Needs List Sent entry)'}
              </p>
              <div className="rounded-md border border-border/60 px-2.5 py-2">
                {r.note ? (
                  <>
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-4">{r.note}</p>
                    {r.noteAt && (
                      <p className="mt-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                        {format(new Date(r.noteAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No status note yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    <ReferralEntityQuickView
      target={showContact && contactId ? { type: 'contact', id: contactId } : null}
      onClose={() => setShowContact(false)}
    />
    </>
  );
}
