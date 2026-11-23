import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import { channelLabel } from './channelOptions';
import { buildBdRevenueTree, type BdNode, type BdSourceInput, type BdMeetingInput } from '@/lib/bdRevenuePerHour';

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
type SortKey = 'revenue' | 'hours' | 'perHour';

/** Revenue (referred-deal fees) and BD calendar hours by Channel → Company → Contact. */
export function BdRevenuePerHourWidget() {
  const { company } = useCompany();
  const dateCtx = useOptionalSalesBdDateRange();
  const start = dateCtx?.start ?? null;
  const end = dateCtx?.end ?? null;
  const { referralSources, resolveChannel, isLoading } = useDealReferralSources();
  const [sort, setSort] = useState<SortKey>('revenue');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sources = useMemo(() => referralSources
    .map((s) => ({ ...s, deals: s.deals.filter((d) => !isExcludedDealName(d.company)) }))
    .filter((s) => s.deals.length > 0), [referralSources]);
  const dealIds = useMemo(() => [...new Set(sources.flatMap((s) => s.deals.map((d) => d.id)))].sort(), [sources]);
  const contactIds = useMemo(() => [...new Set(sources.map((s) => s.contactId).filter((v): v is string => !!v))].sort(), [sources]);

  const { data: fees = new Map<string, number>(), isLoading: feesLoading } = useQuery({
    queryKey: ['bd_rev_hour_fees', dealIds.join(',')],
    enabled: dealIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, number>();
      for (let i = 0; i < dealIds.length; i += 300) {
        const { data, error } = await supabase.from('deals').select('id, total_fee').in('id', dealIds.slice(i, i + 300));
        if (error) throw error;
        for (const d of data || []) map.set(d.id, Number(d.total_fee) || 0);
      }
      return map;
    },
  });
  const { data: emails = new Map<string, string[]>() } = useQuery({
    queryKey: ['bd_rev_hour_emails', contactIds.join(',')],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, string[]>();
      for (let i = 0; i < contactIds.length; i += 300) {
        const { data, error } = await supabase.from('contacts').select('id, email, additional_emails').in('id', contactIds.slice(i, i + 300));
        if (error) throw error;
        for (const c of (data || []) as { id: string; email: string | null; additional_emails: string[] | null }[]) {
          map.set(c.id, [c.email, ...(c.additional_emails || [])].filter((e): e is string => !!e));
        }
      }
      return map;
    },
  });
  const { data: meetings = [], isLoading: meetingsLoading, isError: meetingsError } = useQuery<BdMeetingInput[]>({
    queryKey: ['bd_rev_hour_meetings', company?.id, start?.toISOString(), end?.toISOString()],
    enabled: !!company?.id && !!start && !!end,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calendar-meetings-all', {
        body: { company_id: company!.id, time_min: start!.toISOString(), time_max: end!.toISOString() },
      });
      if (error) throw error;
      return ((data?.events || []) as { id: string; start?: string; end?: string; attendees?: { email?: string }[]; matched_contact_id?: string | null }[]).map((e) => ({
        id: String(e.id), start: e.start || null, end: e.end || null,
        attendeeEmails: (e.attendees || []).map((a) => String(a?.email || '')).filter(Boolean),
        matchedContactId: e.matched_contact_id || null,
      }));
    },
  });

  const tree = useMemo(() => {
    const inputs: BdSourceInput[] = sources.map((s) => ({
      contactId: s.contactId,
      contactName: s.referredBy,
      companyKey: s.crmCompanyId || norm(s.companyName || s.referredBy),
      companyName: s.companyName || 'No company',
      channel: (() => { const c = s.channelType || resolveChannel(s.referredBy, s.companyName); return c ? channelLabel(c) : 'Unassigned'; })(),
      dealIds: s.deals.map((d) => d.id),
      emails: s.contactId ? emails.get(s.contactId) || [] : [],
    }));
    const t = buildBdRevenueTree(inputs, fees, meetings);
    const val = (n: BdNode) => (sort === 'perHour' ? n.perHour ?? -1 : n[sort]);
    const sortRec = (ns: BdNode[]): BdNode[] => [...ns].sort((a, b) => val(b) - val(a)).map((n) => ({ ...n, children: sortRec(n.children) }));
    return sortRec(t);
  }, [sources, emails, fees, meetings, sort, resolveChannel]);

  const toggle = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const loading = isLoading || feesLoading || meetingsLoading;

  const renderRow = (n: BdNode, depth: number, path: string): JSX.Element[] => {
    const key = `${path}/${n.key}`;
    const expandable = n.children.length > 0;
    const isOpen = open.has(key);
    const row = (
      <tr key={key} className="border-b border-border/60 hover:bg-muted/30">
        <td className="py-1.5 pr-2 text-left">
          <button type="button" disabled={!expandable} onClick={() => toggle(key)} className="flex items-center gap-1 text-left" style={{ paddingLeft: depth * 18 }} aria-expanded={expandable ? isOpen : undefined}>
            {expandable ? <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} /> : <span className="w-3.5" />}
            <span className={depth === 0 ? 'font-semibold text-foreground' : depth === 1 ? 'text-foreground' : 'text-muted-foreground'}>{n.label}</span>
          </button>
        </td>
        <td className="px-2 text-center tabular-nums">{n.deals}</td>
        <td className="px-2 text-center tabular-nums">{formatUSDFromDollars(n.revenue)}</td>
        <td className="px-2 text-center tabular-nums">{n.hours > 0 ? n.hours.toFixed(1) : '—'}</td>
        <td className="px-2 text-center font-medium tabular-nums text-primary">{n.perHour != null ? `${formatUSDFromDollars(n.perHour)}/hr` : '—'}</td>
      </tr>
    );
    return [row, ...(isOpen ? n.children.flatMap((c) => renderRow(c, depth + 1, key)) : [])];
  };

  const head = (label: string, k?: SortKey) => (
    <th className="px-2 py-1.5 text-center font-medium">
      {k ? <button type="button" onClick={() => setSort(k)} className={sort === k ? 'text-primary' : 'hover:text-foreground'}>{label}{sort === k ? ' ↓' : ''}</button> : label}
    </th>
  );

  return (
    <section className="glass-module rounded-lg border border-border bg-card p-4" aria-label="Revenue per BD hour">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revenue per BD Hour</h3>
          <p className="text-[11px] text-muted-foreground">Fee revenue from referred deals ÷ calendar hours spent with each contact, rolled up to company and channel.</p>
        </div>
        <span className="text-[11px] text-muted-foreground">{dateCtx?.range?.resolved?.label}</span>
      </div>
      {meetingsError && <p className="mb-2 text-[11px] text-warning">Calendar hours could not be loaded; revenue is still shown.</p>}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 text-left font-medium">Channel / Company / Contact</th>
              {head('Deals')}{head('Revenue', 'revenue')}{head('BD Hours', 'hours')}{head('Revenue / Hour', 'perHour')}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              : tree.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No referred deals in this timeframe</td></tr>
              : tree.flatMap((n) => renderRow(n, 0, ''))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
