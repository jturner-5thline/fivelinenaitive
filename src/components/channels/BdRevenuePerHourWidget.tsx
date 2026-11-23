import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import { channelLabel } from './channelOptions';
import { buildBdRevenueTree, formatBdLag, isBdReferralInRange, meetingHours, type BdNode, type BdSourceInput, type BdMeetingInput } from '@/lib/bdRevenuePerHour';

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
type DrillKind = 'deals' | 'meetings' | 'pairs';
type MeetingRow = BdMeetingInput & { title: string; owner: string | null };
type SortKey = 'deals' | 'revenue' | 'hours' | 'perHour' | 'meetings' | 'meetingsPerDeal' | 'avgLagDays';

/** Revenue (referred-deal fees) and BD calendar hours by Channel → Company → Contact. */
export function BdRevenuePerHourWidget() {
  const { company } = useCompany();
  const dateCtx = useOptionalSalesBdDateRange();
  const start = dateCtx?.start ?? null;
  const end = dateCtx?.end ?? null;
  const { referralSources, resolveChannel, isLoading } = useDealReferralSources({ ignoreDateRange: true });
  const [sort, setSort] = useState<SortKey>('revenue');
  const [ascending, setAscending] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ node: BdNode; kind: DrillKind } | null>(null);

  const sources = useMemo(() => referralSources
    .map((s) => ({ ...s, deals: s.deals.filter((d) => !isExcludedDealName(d.company) && isBdReferralInRange(d.ndaEnteredAt, start, end)) }))
    .filter((s) => s.deals.length > 0), [referralSources, start, end]);
  const dealIds = useMemo(() => [...new Set(sources.flatMap((s) => s.deals.map((d) => d.id)))].sort(), [sources]);
  const contactIds = useMemo(() => [...new Set(sources.map((s) => s.contactId).filter((v): v is string => !!v))].sort(), [sources]);

  const { data: fees = new Map<string, number>(), isLoading: feesLoading, isError: feesError } = useQuery({
    queryKey: ['bd_rev_hour_fees', company?.id, dealIds.join(',')],
    enabled: !!company?.id && dealIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, number>();
      if (!company?.id) return map;
      for (let i = 0; i < dealIds.length; i += 300) {
        const { data, error } = await supabase.from('deals').select('id, total_fee').eq('company_id', company.id).in('id', dealIds.slice(i, i + 300));
        if (error) throw error;
        for (const d of data || []) map.set(d.id, Number(d.total_fee) || 0);
      }
      return map;
    },
  });
  const { data: emails = new Map<string, string[]>(), isLoading: emailsLoading, isError: emailsError } = useQuery({
    queryKey: ['bd_rev_hour_emails', company?.id, contactIds.join(',')],
    enabled: !!company?.id && contactIds.length > 0,
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
  const { data: meetings = [], isLoading: meetingsLoading, isError: meetingsError } = useQuery<MeetingRow[]>({
    queryKey: ['bd_rev_hour_meetings', company?.id, start?.toISOString(), end?.toISOString()],
    enabled: !!company?.id && !!start && !!end,
    queryFn: async () => {
      if (!company?.id || !start || !end) return [];
      const { data, error } = await supabase.functions.invoke('calendar-meetings-all', {
        body: { company_id: company.id, time_min: start.toISOString(), time_max: end.toISOString() },
      });
      if (error) throw error;
      return ((data?.events || []) as { id: string; start?: string; end?: string; attendees?: { email?: string }[]; matched_contact_id?: string | null; title?: string; owner_name?: string | null; owner_email?: string | null }[]).map((e) => ({
        id: String(e.id), title: e.title || '(No title)', owner: e.owner_name || e.owner_email || null, start: e.start || null, end: e.end || null,
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
    const ndaByDeal = new Map<string, string>();
    sources.forEach(s => s.deals.forEach(d => { if (d.ndaEnteredAt) ndaByDeal.set(d.id, d.ndaEnteredAt); }));
    const t = buildBdRevenueTree(inputs, fees, meetings, ndaByDeal);
    const sortRec = (ns: BdNode[]): BdNode[] => [...ns].sort((a, b) => {
      const av = a[sort], bv = b[sort];
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (ascending ? av - bv : bv - av) || a.label.localeCompare(b.label);
    }).map((n) => ({ ...n, children: sortRec(n.children) }));
    return sortRec(t);
  }, [sources, emails, fees, meetings, sort, ascending, resolveChannel]);

  const dealInfo = useMemo(() => {
    const m = new Map<string, { company: string; referredBy: string; ndaEnteredAt: string | null; stage: string }>();
    sources.forEach((s) => s.deals.forEach((d) => m.set(d.id, { company: d.company, referredBy: s.referredBy, ndaEnteredAt: d.ndaEnteredAt, stage: d.stage })));
    return m;
  }, [sources]);
  const meetingById = useMemo(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);
  const toggle = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const loading = isLoading || feesLoading || meetingsLoading || emailsLoading;

  const renderRow = (n: BdNode, depth: number, path: string): JSX.Element[] => {
    const key = `${path}/${n.key}`;
    const expandable = n.children.length > 0;
    const isOpen = open.has(key);
    const row = (
      <tr key={key} className="border-b border-border/60 hover:bg-muted/30">
        <td className="py-1.5 pr-2 text-left">
          <Button type="button" variant="ghost" disabled={!expandable} onClick={() => toggle(key)} className={`h-auto justify-start gap-1 py-0 text-left text-xs ${depth === 2 ? 'pl-9' : depth === 1 ? 'pl-[18px]' : 'pl-0'}`} aria-expanded={expandable ? isOpen : undefined}>
            {expandable ? <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} /> : <span className="w-3.5" />}
            <span className={depth === 0 ? 'font-semibold text-foreground' : depth === 1 ? 'text-foreground' : 'text-muted-foreground'}>{n.label}</span>
          </Button>
        </td>
        <td className="px-2 text-center tabular-nums"><button type="button" onClick={() => setDrill({ node: n, kind: 'deals' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{n.deals}</button></td>
        <td className="px-2 text-center tabular-nums"><button type="button" onClick={() => setDrill({ node: n, kind: 'deals' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{feesError ? '—' : formatUSDFromDollars(n.revenue)}</button></td>
        <td className="px-2 text-center tabular-nums"><button type="button" onClick={() => setDrill({ node: n, kind: 'meetings' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{!meetingsError && n.hours > 0 ? n.hours.toFixed(1) : '—'}</button></td>
        <td className="px-2 text-center tabular-nums font-medium text-primary"><button type="button" onClick={() => setDrill({ node: n, kind: 'deals' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{!feesError && !meetingsError && n.perHour != null ? `${formatUSDFromDollars(n.perHour)}/hr` : '—'}</button></td>
        <td className="px-2 text-center tabular-nums"><button type="button" onClick={() => setDrill({ node: n, kind: 'meetings' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{meetingsError ? '—' : n.meetings}</button></td>
        <td className="px-2 text-center tabular-nums"><button type="button" onClick={() => setDrill({ node: n, kind: 'pairs' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{!meetingsError && n.meetingsPerDeal !== null ? n.meetingsPerDeal.toFixed(1) : '—'}</button></td>
        <td className="px-2 text-center tabular-nums"><button type="button" onClick={() => setDrill({ node: n, kind: 'pairs' })} className="rounded px-1 underline-offset-2 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary">{meetingsError ? '—' : formatBdLag(n.avgLagDays)}</button></td>
      </tr>
    );
    return [row, ...(isOpen ? n.children.flatMap((c) => renderRow(c, depth + 1, key)) : [])];
  };

  const head = (label: string, k: SortKey, description?: string) => (
    <th className="px-2 py-1.5 text-center font-medium" aria-sort={sort === k ? ascending ? 'ascending' : 'descending' : 'none'}>
      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" onClick={() => { if (sort === k) setAscending(v => !v); else { setSort(k); setAscending(k === 'avgLagDays' || k === 'meetingsPerDeal'); } }} className={`h-auto px-0 py-0 text-xs ${sort === k ? 'text-primary' : ''}`}>{label}{sort === k ? ascending ? ' ↑' : ' ↓' : ''}</Button>
      </TooltipTrigger><TooltipContent className="max-w-xs">{description || `Sort by ${label.toLowerCase()}`}</TooltipContent></Tooltip>
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
      {meetingsError && <p className="mb-2 text-[11px] text-warning">Calendar meetings could not be loaded; meeting metrics are unavailable.</p>}
      {feesError && <p className="mb-2 text-[11px] text-warning">Referred-deal revenue could not be loaded.</p>}
      {emailsError && <p className="mb-2 text-[11px] text-warning">Contact emails could not be loaded; meeting matches may be incomplete.</p>}
      <div className="max-h-[480px] max-w-full overflow-auto">
        <table className="w-full min-w-[920px] text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 text-left font-medium">Channel / Company / Contact</th>
              {head('Deals', 'deals', 'Referrals with recorded Active pipeline entry, dated by NDA / Needs List Sent (or closest later stage), in the selected timeframe.')}{head('Revenue', 'revenue')}{head('BD Hours', 'hours')}{head('Revenue / Hour', 'perHour')}
              {head('Mtgs', 'meetings', 'Unique matched calendar calls/meetings in the selected timeframe; counted once per company and channel.')}
              {head('Mtgs / Deal', 'meetingsPerDeal', 'Selected-period unique BD meetings divided by NDA-dated referrals. This is an observed ratio, not a causal conversion rate.')}
              {head('Avg Lag to Deal', 'avgLagDays', 'Average days from each selected-period meeting to every subsequent selected-period referral by that contact. Parent totals deduplicate meeting/referral pairs. Meetings without a later referral do not enter the average; this does not prove causation.')}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              : tree.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No NDA-dated referrals in this timeframe</td></tr>
              : tree.flatMap((n) => renderRow(n, 0, ''))}
          </tbody>
        </table>
      </div>
      <BdDrilldownDialog drill={drill} onClose={() => setDrill(null)} fees={fees} dealInfo={dealInfo} meetingById={meetingById} />
    </section>
  );
}

const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function BdDrilldownDialog({ drill, onClose, fees, dealInfo, meetingById }: {
  drill: { node: BdNode; kind: DrillKind } | null;
  onClose: () => void;
  fees: Map<string, number>;
  dealInfo: Map<string, { company: string; referredBy: string; ndaEnteredAt: string | null; stage: string }>;
  meetingById: Map<string, MeetingRow>;
}) {
  const n = drill?.node;
  const deals = (n?.dealIds ?? []).map((id) => ({ id, ...(dealInfo.get(id) ?? { company: 'Unknown deal', referredBy: '—', ndaEnteredAt: null, stage: '' }), fee: fees.get(id) || 0 }))
    .sort((a, b) => b.fee - a.fee);
  const meetings = (n?.meetingIds ?? []).map((id) => meetingById.get(id)).filter((m): m is MeetingRow => !!m)
    .sort((a, b) => Date.parse(b.start || '') - Date.parse(a.start || ''));
  const pairsByDeal = new Map<string, { meeting: MeetingRow | undefined; days: number }[]>();
  (n?.pairs ?? []).forEach((p) => { const l = pairsByDeal.get(p.dealId) ?? []; l.push({ meeting: meetingById.get(p.meetingId), days: p.days }); pairsByDeal.set(p.dealId, l); });
  const title = drill?.kind === 'deals' ? 'Referred deals & revenue' : drill?.kind === 'meetings' ? 'BD meetings' : 'Meetings → subsequent referrals';
  const th = 'px-2 py-1.5 text-left font-medium';
  return (
    <Dialog open={!!drill} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">{title} — {n?.label}</DialogTitle>
          {n && <p className="text-[11px] text-muted-foreground">{n.deals} deals · {formatUSDFromDollars(n.revenue)} · {n.hours.toFixed(1)} hrs · {n.meetings} mtgs · avg lag {formatBdLag(n.avgLagDays)}</p>}
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto">
          {drill?.kind === 'deals' && (
            <table className="w-full text-xs"><thead className="sticky top-0 bg-card text-muted-foreground"><tr className="border-b border-border"><th className={th}>Deal</th><th className={th}>Referral source</th><th className={th}>NDA entry</th><th className="px-2 py-1.5 text-right font-medium">Fee revenue</th></tr></thead>
              <tbody>{deals.length === 0 ? <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No deals</td></tr> : deals.map((d) => (
                <tr key={d.id} className="border-b border-border/60"><td className="px-2 py-1.5"><a href={`/deals/${d.id}`} className="text-foreground hover:text-primary hover:underline">{d.company}</a></td><td className="px-2">{d.referredBy}</td><td className="px-2 tabular-nums">{fmtDate(d.ndaEnteredAt)}</td><td className="px-2 text-right tabular-nums">{formatUSDFromDollars(d.fee)}</td></tr>))}
              </tbody></table>
          )}
          {drill?.kind === 'meetings' && (
            <table className="w-full text-xs"><thead className="sticky top-0 bg-card text-muted-foreground"><tr className="border-b border-border"><th className={th}>Date</th><th className={th}>Meeting</th><th className={th}>Calendar owner</th><th className="px-2 py-1.5 text-right font-medium">Hours</th></tr></thead>
              <tbody>{meetings.length === 0 ? <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No matched meetings in this timeframe</td></tr> : meetings.map((m) => (
                <tr key={m.id} className="border-b border-border/60"><td className="px-2 py-1.5 tabular-nums">{fmtDate(m.start)}</td><td className="px-2">{m.title}</td><td className="px-2 text-muted-foreground">{m.owner || '—'}</td><td className="px-2 text-right tabular-nums">{meetingHours(m).toFixed(1)}</td></tr>))}
              </tbody></table>
          )}
          {drill?.kind === 'pairs' && (
            <div className="space-y-3">
              {deals.map((d) => { const ps = (pairsByDeal.get(d.id) ?? []).sort((a, b) => b.days - a.days); return (
                <div key={d.id} className="rounded border border-border p-2">
                  <div className="flex flex-wrap justify-between gap-2 text-xs"><a href={`/deals/${d.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">{d.company}</a><span className="text-muted-foreground">Referred by {d.referredBy} · NDA {fmtDate(d.ndaEnteredAt)} · {formatUSDFromDollars(d.fee)}</span></div>
                  {ps.length === 0 ? <p className="mt-1 text-[11px] text-muted-foreground">No matched meetings before this referral in the timeframe.</p> : (
                    <ul className="mt-1 space-y-0.5 text-[11px]">{ps.map((p, i) => <li key={i} className="flex justify-between gap-2"><span>{fmtDate(p.meeting?.start)} — {p.meeting?.title ?? 'Meeting'}</span><span className="tabular-nums text-muted-foreground">{formatBdLag(p.days)} before referral</span></li>)}</ul>)}
                </div>); })}
              {deals.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No deals</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
