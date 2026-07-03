import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Users, Building2, Handshake, UserCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartners, type Partner } from '@/hooks/usePartnersPipeline';
import { useChannelEntries, type ChannelEntry } from '@/hooks/useChannelEntries';

export type SalesBdReferralHit = {
  id: string;
  name: string;
  company: string | null;
  channel: string | null;
  email: string | null;
};

type Props = {
  onSelectPartner: (partner: Partner) => void;
  onSelectChannelEntry: (entry: ChannelEntry) => void;
  onSelectReferralSource: (ref: SalesBdReferralHit) => void;
};

const norm = (s: string | null | undefined) => (s || '').toLowerCase();

export function SalesBdSearch({ onSelectPartner, onSelectChannelEntry, onSelectReferralSource }: Props) {
  const { company } = useCompany();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: partners = [] } = usePartners();
  const { data: channelEntries = [] } = useChannelEntries();
  const { data: referralRows = [] } = useQuery({
    queryKey: ['sales_bd_search_referrals', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, contact_name, company, channel, email')
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string | null;
        contact_name: string | null;
        company: string | null;
        channel: string | null;
        email: string | null;
      }>;
    },
  });

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query) return { partners: [], entries: [], referrals: [] };
    const partnerHits = partners
      .filter((p) => norm(p.name).includes(query) || norm(p.firm_type).includes(query))
      .slice(0, 6);
    const entryHits = channelEntries
      .filter((e) => {
        const parts = [
          e.contact?.full_name,
          e.contact?.email,
          e.contact?.job_title,
          e.crm_company?.name,
          e.crm_company?.domain,
          e.crm_company?.industry,
          e.channel_type,
          e.notes,
        ];
        return parts.some((p) => norm(p).includes(query));
      })
      .slice(0, 8);
    const refHits: SalesBdReferralHit[] = referralRows
      .filter((r) => {
        return (
          norm(r.name).includes(query) ||
          norm(r.contact_name).includes(query) ||
          norm(r.company).includes(query) ||
          norm(r.channel).includes(query) ||
          norm(r.email).includes(query)
        );
      })
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        name: r.name || r.contact_name || 'Unnamed',
        company: r.company,
        channel: r.channel,
        email: r.email,
      }));
    return { partners: partnerHits, entries: entryHits, referrals: refHits };
  }, [query, partners, channelEntries, referralRows]);

  const totalHits = results.partners.length + results.entries.length + results.referrals.length;

  useEffect(() => {
    if (query && !open) setOpen(true);
  }, [query, open]);

  const close = () => {
    setOpen(false);
  };

  return (
    <Popover open={open && query.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => query && setOpen(true)}
            placeholder="Search contacts, companies, channels…"
            className="h-8 w-64 pl-7 text-xs"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[380px] p-0 max-h-[420px] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {totalHits === 0 ? (
          <p className="text-xs text-muted-foreground p-4 text-center">No matches</p>
        ) : (
          <div className="py-1">
            {results.partners.length > 0 && (
              <Section title="Partners" icon={Handshake}>
                {results.partners.map((p) => (
                  <Row
                    key={p.id}
                    title={p.name}
                    subtitle={p.firm_type || 'Partner'}
                    onClick={() => {
                      onSelectPartner(p);
                      close();
                    }}
                  />
                ))}
              </Section>
            )}
            {results.entries.length > 0 && (
              <Section title="Channels · Contacts & Companies" icon={results.entries[0].crm_company ? Building2 : Users}>
                {results.entries.map((e) => {
                  const title = e.crm_company?.name || e.contact?.full_name || 'Unnamed';
                  const sub = [
                    e.contact?.full_name && e.crm_company?.name ? e.contact.full_name : null,
                    e.contact?.job_title,
                    e.channel_type,
                    e.crm_company?.industry,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Row
                      key={e.id}
                      title={title}
                      subtitle={sub || 'Channel entry'}
                      onClick={() => {
                        onSelectChannelEntry(e);
                        close();
                      }}
                    />
                  );
                })}
              </Section>
            )}
            {results.referrals.length > 0 && (
              <Section title="Referral Sources" icon={UserCheck}>
                {results.referrals.map((r) => (
                  <Row
                    key={r.id}
                    title={r.name}
                    subtitle={[r.company, r.channel, r.email].filter(Boolean).join(' · ') || 'Referral source'}
                    onClick={() => {
                      onSelectReferralSource(r);
                      close();
                    }}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-1">
      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 hover:bg-accent/40 transition-colors"
    >
      <p className="text-xs font-medium text-foreground truncate">{title}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
    </button>
  );
}