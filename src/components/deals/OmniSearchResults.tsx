import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Building2, Landmark, LayoutGrid, User, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDealsContext } from '@/contexts/DealsContext';
import { useLenders } from '@/contexts/LendersContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { formatSlug } from '@/utils/dealTypeLabels';
import { cn } from '@/lib/utils';
import { OmniKind, OmniResult, rankTop, sanitizeIlike } from './omniSearch';

const PAGES = [
  { name: 'Deals', path: '/deals' },
  { name: 'Insights', path: '/insights' },
  { name: 'Sales & BD', path: '/insights?dashboard=sales-bd-page' },
  { name: 'Contacts', path: '/contacts' },
  { name: 'Companies', path: '/crm-companies' },
  { name: 'Funding Sources', path: '/lenders' },
  { name: 'Tasks', path: '/tasks' },
  { name: 'Settings', path: '/settings' },
];

const KIND_META: Record<OmniKind, { label: string; icon: typeof Briefcase; tone: string }> = {
  deal: { label: 'Deals', icon: Briefcase, tone: 'text-primary' },
  contact: { label: 'Contacts', icon: User, tone: 'text-sky-400' },
  company: { label: 'Companies', icon: Building2, tone: 'text-indigo-300' },
  lender: { label: 'Funding Sources', icon: Landmark, tone: 'text-amber-400' },
  page: { label: 'Pages', icon: LayoutGrid, tone: 'text-muted-foreground' },
};
const ORDER: OmniKind[] = ['deal', 'contact', 'company', 'lender', 'page'];

const money = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

interface Props {
  query: string;
  activeIndex: number;
  onResults: (r: OmniResult[]) => void;
  onSelect: (r: OmniResult) => void;
  onHover: (i: number) => void;
}

export function OmniSearchResults({ query, activeIndex, onResults, onSelect, onHover }: Props) {
  const [scope, setScope] = useState<OmniKind | 'all'>('all');
  const { deals } = useDealsContext();
  const { lenders } = useLenders();
  const { pipelines } = usePipelineContext();
  const q = query.trim();
  const remoteQ = sanitizeIlike(useDebounced(q, 220));

  const { data: remote, isFetching } = useQuery({
    queryKey: ['omni-search', remoteQ],
    enabled: remoteQ.length >= 2,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const like = `%${remoteQ}%`;
      const [c, co, fs] = await Promise.all([
        supabase.from('contacts').select('id, full_name, first_name, last_name, email, hs_company_name')
          .or(`full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
          .limit(6).abortSignal(signal),
        supabase.from('crm_companies').select('id, name, domain, industry, hq_city, hq_state')
          .or(`name.ilike.${like},domain.ilike.${like}`)
          .limit(6).abortSignal(signal),
        supabase.from('master_lenders').select('id, name, contact_name, email, lender_type, website')
          .or(`name.ilike.${like},contact_name.ilike.${like},email.ilike.${like},website.ilike.${like}`)
          .limit(8).abortSignal(signal),
      ]);
      return { contacts: c.data ?? [], companies: co.data ?? [], lenders: (fs.data ?? []) as any[] };
    },
  });

  const results = useMemo<OmniResult[]>(() => {
    if (!q) return [];
    const stageLabel = (stage: string, pid?: string) =>
      pipelines.find((p) => p.id === pid)?.stages?.find((s) => s.id === stage || s.label === stage)?.label ?? formatSlug(stage);
    const pipelineName = (pid?: string) => pipelines.find((p) => p.id === pid)?.name;

    const dealR = rankTop(deals ?? [], (d: any) => [d.company, d.name, d.borrower], q, 6).map((d: any): OmniResult => ({
      kind: 'deal', id: d.id, title: d.company,
      subtitle: [pipelineName(d.pipelineId), money(d.value)].filter(Boolean).join(' • '),
      badge: stageLabel(d.stage, d.pipelineId),
      path: `/deals?deal=${d.id}`,
    }));
    const contactR = rankTop(remote?.contacts ?? [], (c: any) => [c.full_name, `${c.first_name ?? ''} ${c.last_name ?? ''}`, c.email], q, 5).map((c: any): OmniResult => ({
      kind: 'contact', id: c.id,
      title: c.full_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email || 'Contact',
      subtitle: [c.hs_company_name, c.email].filter(Boolean).join(' • '),
      path: `/contacts/${c.id}`,
    }));
    const companyR = rankTop(remote?.companies ?? [], (c: any) => [c.name, c.domain], q, 5).map((c: any): OmniResult => ({
      kind: 'company', id: c.id, title: c.name,
      subtitle: [c.industry, [c.hq_city, c.hq_state].filter(Boolean).join(', ')].filter(Boolean).join(' • '),
      path: `/crm-companies/${c.id}`,
    }));
    const seen = new Set<string>();
    const lenderPool = [
      ...(remote?.lenders ?? []).map((l: any) => ({ name: l.name, contact: l.contact_name, extra: l.email, type: l.lender_type, site: l.website })),
      ...(lenders ?? []).map((l: any) => ({ name: l.name, contact: l.contact?.name, extra: l.contact?.email, type: undefined, site: l.website })),
    ].filter((l) => l.name && !seen.has(l.name.toLowerCase()) && seen.add(l.name.toLowerCase()));
    const lenderR = rankTop(lenderPool, (l) => [l.name, l.contact, l.extra, l.site], q, 6).map((l): OmniResult => ({
      kind: 'lender', id: l.name, title: l.name,
      subtitle: [l.type, l.contact].filter(Boolean).join(' • ') || undefined,
      path: `/lenders?lender=${encodeURIComponent(l.name)}`,
    }));
    const pageR = rankTop(PAGES, (p) => [p.name], q, 4).map((p): OmniResult => ({ kind: 'page', id: p.path, title: p.name, path: p.path }));
    return [...dealR, ...contactR, ...companyR, ...lenderR, ...pageR];
  }, [q, deals, lenders, pipelines, remote]);

  const counts = useMemo(() => {
    const c: Partial<Record<OmniKind, number>> = {};
    results.forEach((r) => { c[r.kind] = (c[r.kind] ?? 0) + 1; });
    return c;
  }, [results]);
  const visible = scope === 'all' ? results : results.filter((r) => r.kind === scope);

  useEffect(() => { onResults(visible); }, [visible, onResults]);

  if (!q) return null;
  const loading = isFetching || (remoteQ !== sanitizeIlike(q) && q.length >= 2);

  return (
    <div
      className="absolute left-0 top-[calc(100%+6px)] z-[1100] w-[min(520px,90vw)] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-2">
        {(['all', ...ORDER] as const).map((k) => {
          const n = k === 'all' ? results.length : counts[k] ?? 0;
          if (k !== 'all' && n === 0) return null;
          return (
            <button key={k} type="button" onClick={() => setScope(k)}
              className={cn('rounded-full px-2.5 py-0.5 text-[11px] transition-colors',
                scope === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              {k === 'all' ? 'All' : KIND_META[k].label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
        {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Searching" />}
      </div>
      <div className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
        {visible.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results for “{q}”</p>
        )}
        {ORDER.map((kind) => {
          const group = visible.filter((r) => r.kind === kind);
          if (!group.length) return null;
          const Meta = KIND_META[kind];
          return (
            <div key={kind} className="py-1">
              <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{Meta.label}</div>
              {group.map((r) => {
                const i = visible.indexOf(r);
                return (
                  <button key={`${r.kind}-${r.id}`} type="button" role="option" aria-selected={i === activeIndex}
                    onMouseEnter={() => onHover(i)} onClick={() => onSelect(r)}
                    className={cn('flex w-full items-center gap-3 border-0 rounded-none px-3 py-2 text-left transition-colors', i === activeIndex ? 'bg-muted' : 'hover:bg-muted/60')}>
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60', Meta.tone)}>
                      <Meta.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{r.title}</span>
                      {r.subtitle && <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                    </span>
                    {r.badge && <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.badge}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
