import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ExternalLink, Mail, User } from 'lucide-react';
import { format } from 'date-fns';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChannelPartnerActivityHistory } from './ChannelPartnerActivityHistory';
import { ChannelPartnerStatusNotes } from './ChannelPartnerStatusNotes';

type Contact = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; job_title: string | null };

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export function ChannelPartnerDetailDialog({ partnerId, crmCompanyId, name, onOpenChange }: { partnerId: string | null; crmCompanyId: string | null; name: string; onOpenChange: (o: boolean) => void }) {
  const { company } = useCompany();
  const navigate = useNavigate();
  const open = !!crmCompanyId;

  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: ['channel_partner_company', crmCompanyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_companies').select('id, name, description, domain, website_url').eq('id', crmCompanyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['channel_partner_contacts', crmCompanyId, company?.id],
    enabled: open && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, job_title')
        .eq('crm_company_id', crmCompanyId!)
        .eq('org_company_id', company!.id)
        .order('full_name')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  // Same source the Referral Source Pipeline uses, plus manually added sources.
  const { referralSources } = useDealReferralSources({ ignoreDateRange: true });
  const { data: manual = [] } = useQuery({
    queryKey: ['referral_sources_contact_refs', company?.id],
    enabled: open && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('referral_sources').select('contact_id, contact_email, email, name').eq('company_id', company!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const inPipeline = useMemo(() => {
    const ids = new Set<string>();
    const emails = new Set<string>();
    const names = new Set<string>();
    for (const r of referralSources) { if (r.contactId) ids.add(r.contactId); names.add(norm(r.referredBy)); }
    for (const m of manual) {
      if (m.contact_id) ids.add(m.contact_id);
      if (m.contact_email) emails.add(norm(m.contact_email));
      if (m.email) emails.add(norm(m.email));
      if (m.name) names.add(norm(m.name));
    }
    return (c: Contact) => {
      const full = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
      return ids.has(c.id) || (!!c.email && emails.has(norm(c.email))) || (!!full && names.has(norm(full)));
    };
  }, [referralSources, manual]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const dealsFor = (c: Contact) => {
    const full = norm(c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' '));
    const seen = new Map<string, (typeof referralSources)[number]['deals'][number]>();
    for (const r of referralSources) {
      if (r.contactId === c.id || (!!full && norm(r.referredBy) === full)) {
        for (const d of r.deals) seen.set(d.id, d);
      }
    }
    return [...seen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{info?.name || name}</DialogTitle>
          <DialogDescription>{info?.domain || 'Channel partner'}</DialogDescription>
        </DialogHeader>

        <ChannelPartnerStatusNotes partnerId={partnerId} />

        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h4>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {infoLoading ? 'Loading…' : info?.description?.trim() || 'No description on file.'}
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacts ({contacts.length})</h4>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {contactsLoading && <p className="text-xs text-muted-foreground py-2">Loading…</p>}
            {!contactsLoading && contacts.length === 0 && <p className="text-xs text-muted-foreground py-2">No contacts linked to this company.</p>}
            {contacts.map(c => {
              const full = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed contact';
              const referral = inPipeline(c);
              const deals = referral ? dealsFor(c) : [];
              const isOpen = expanded === c.id;
              return (
                <div key={c.id} className="py-2">
                  <button
                    type="button"
                    disabled={!referral}
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="flex w-full items-start gap-2 text-left disabled:cursor-default"
                    aria-expanded={referral ? isOpen : undefined}
                  >
                    {referral
                      ? <ChevronRight className={`h-3.5 w-3.5 mt-0.5 text-primary shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      : <User className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{full}</p>
                      {c.job_title && <p className="text-[11px] text-muted-foreground truncate">{c.job_title}</p>}
                      {c.email && <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</p>}
                      {referral && <p className="text-[11px] text-primary mt-0.5">Also in the Referral Source Pipeline · {deals.length} deal{deals.length === 1 ? '' : 's'} referred</p>}
                    </div>
                    {referral && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary shrink-0">Referral source</Badge>}
                  </button>
                  {referral && isOpen && (
                    <div className="mt-2 ml-5 space-y-1">
                      {deals.length === 0 && <p className="text-[11px] text-muted-foreground">No referred deals on record.</p>}
                      {deals.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => navigate(`/deals/${d.id}`)}
                          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted/40"
                        >
                          <span className="min-w-0">
                            <span className="block text-xs text-foreground truncate">{d.company}</span>
                            <span className="block text-[10px] text-muted-foreground truncate">{d.pipelineName} · {d.stage}{d.ndaEnteredAt ? ` · ${format(new Date(d.ndaEnteredAt), 'MMM d, yyyy')}` : ''}</span>
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">{d.value ? formatUSDFromDollars(d.value) : '—'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <ChannelPartnerActivityHistory partnerId={partnerId} />

        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => navigate(`/crm-companies/${crmCompanyId}`)}>
          <ExternalLink className="h-3.5 w-3.5" /> Open company
        </Button>
      </DialogContent>
    </Dialog>
  );
}
