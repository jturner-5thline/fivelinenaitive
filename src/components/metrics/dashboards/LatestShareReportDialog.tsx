import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useDealsContext } from '@/contexts/DealsContext';
import { useQuery } from '@tanstack/react-query';

const STATUS_BUCKETS = [
  { key: 'on-track' as const,  label: 'On Track',  color: 'hsl(142 71% 45%)' },
  { key: 'at-risk' as const,   label: 'At Risk',   color: 'hsl(48 96% 53%)' },
  { key: 'off-track' as const, label: 'Off Track', color: 'hsl(0 84% 60%)' },
];

type StatusKey = typeof STATUS_BUCKETS[number]['key'];

interface StatusDeal { id: string; name: string; fee: number; status: StatusKey }

function formatFee(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** Fetch the pie chart's underlying deals (same source rules as the chart itself). */
function useDealsByStatusDrilldown(enabled: boolean) {
  return useQuery({
    queryKey: ['deals-by-status-drilldown', 'active-pipeline'],
    enabled,
    queryFn: async () => {
      const FIFTH_LINE_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';
      const { data: pipelines, error: pipeErr } = await supabase
        .from('deal_pipelines')
        .select('id')
        .eq('company_id', FIFTH_LINE_COMPANY_ID)
        .eq('is_default', true)
        .limit(1);
      if (pipeErr) throw pipeErr;
      const activePipelineId = pipelines?.[0]?.id;
      if (!activePipelineId) return [] as StatusDeal[];

      const { data, error } = await supabase
        .from('deals')
        .select('id, company, status, total_fee')
        .eq('pipeline_id', activePipelineId)
        .in('status', ['on-track', 'at-risk', 'off-track']);
      if (error) throw error;

      const excluded = new Set(["Test-Niki's Store", 'Example Deal']);
      return (data ?? [])
        .filter((d) => {
          const name = (d.company ?? '').trim();
          if (!name) return false;
          if (excluded.has(name)) return false;
          if (name.toLowerCase().startsWith('test ')) return false;
          return true;
        })
        .map<StatusDeal>((d) => ({
          id: d.id as string,
          name: (d.company ?? '').trim(),
          fee: Number(d.total_fee) || 0,
          status: d.status as StatusKey,
        }));
    },
    staleTime: 60_000,
  });
}

interface LatestReport {
  id: string;
  subject: string;
  body_html: string;
  recipients: string[];
  cc: string[];
  sender_name: string | null;
  sender_email: string | null;
  pipeline_name: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedItem {
  dealName: string;
  amount: string;
  stage: string;
  note: string;
}

interface ParsedGroup {
  label: string;
  color: string;
  items: ParsedItem[];
}

interface ParsedReport {
  introHtml: string;
  groups: ParsedGroup[];
  outroHtml: string;
}

/**
 * Parse the HTML the Share Report edge function stored. Structure:
 *   <p>intro…</p>
 *   <p><strong><span style="color:…">Status</span></strong> (n)</p>
 *   <ul><li><strong>Name</strong> — <strong>Amt</strong> — <strong>Stage</strong> — note</li>…</ul>
 *   … (repeat) …
 *   <p>outro…</p>
 * Falls back gracefully if the structure ever drifts.
 */
function parseReport(html: string): ParsedReport {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nodes = Array.from(doc.body.childNodes);
    const groups: ParsedGroup[] = [];
    const introParts: string[] = [];
    const outroParts: string[] = [];
    let phase: 'intro' | 'groups' | 'outro' = 'intro';
    let current: ParsedGroup | null = null;

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const isGroupHeader =
        node.tagName === 'P' &&
        node.querySelector('strong > span[style*="color"]') !== null;
      if (isGroupHeader) {
        phase = 'groups';
        const span = node.querySelector('strong > span[style*="color"]') as HTMLElement;
        const color = span.style.color || 'inherit';
        const label = span.textContent?.trim() || 'Status';
        current = { label, color, items: [] };
        groups.push(current);
        continue;
      }
      if (node.tagName === 'UL' && current) {
        for (const li of Array.from(node.querySelectorAll('li'))) {
          const strongs = Array.from(li.querySelectorAll('strong'));
          const dealName = strongs[0]?.textContent?.trim() || '';
          const amount = strongs[1]?.textContent?.trim() || '';
          const stage = strongs[2]?.textContent?.trim() || '';
          // Note = full li text minus the three strong pieces and the em dashes.
          const full = li.textContent || '';
          const parts = full.split('—').map((s) => s.trim());
          const note = parts.slice(3).join(' — ');
          current.items.push({ dealName, amount, stage, note });
        }
        continue;
      }
      // Any other paragraph before groups → intro; after groups → outro.
      if (phase === 'intro') introParts.push(node.outerHTML);
      else { phase = 'outro'; outroParts.push(node.outerHTML); }
    }
    return { introHtml: introParts.join(''), groups, outroHtml: outroParts.join('') };
  } catch {
    return { introHtml: html, groups: [], outroHtml: '' };
  }
}

export function LatestShareReportDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<LatestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { deals } = useDealsContext();
  const { data: drilldownDeals = [], isLoading: drilldownLoading } =
    useDealsByStatusDrilldown(open);

  const drilldownGrouped = useMemo(() => {
    return STATUS_BUCKETS.map((b) => {
      const items = drilldownDeals
        .filter((d) => d.status === b.key)
        .sort((a, b) => b.fee - a.fee);
      const total = items.reduce((sum, d) => sum + (d.fee > 0 ? d.fee : 0), 0);
      return { ...b, items, total };
    });
  }, [drilldownDeals]);
  const grandTotal = drilldownGrouped.reduce((s, g) => s + g.total, 0);

  const dealIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of deals) {
      if (d?.name) map.set(d.name.trim().toLowerCase(), d.id);
    }
    return map;
  }, [deals]);

  const parsed = useMemo(
    () => (report ? parseReport(report.body_html) : null),
    [report],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from('shared_pipeline_reports' as any)
        .select('id, subject, body_html, recipients, cc, sender_name, sender_email, pipeline_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setReport(null);
      } else {
        setReport((data as unknown as LatestReport) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20 w-[min(900px,calc(100vw-32px))] sm:max-w-[min(900px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle>Latest Shared Pipeline Report</DialogTitle>
          <DialogDescription>
            The most recent Share Report sent from the Deals page. Click a deal name to open its details.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load report: {error}</p>
          ) : !report ? (
            <p className="text-sm text-muted-foreground">
              No shared reports yet. Open the Deals page and use "Share Report" to send one.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Pie chart drill-down: current Active Pipeline deals grouped by status. */}
              <div className="rounded-md border border-border/60 bg-background p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">
                    Active Pipeline — Deals by Status
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    Total fee: <span className="text-foreground font-medium">{formatFee(grandTotal)}</span>
                  </div>
                </div>
                {drilldownLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <div className="space-y-3">
                    {drilldownGrouped.map((g) => (
                      <div key={g.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: g.color }}
                              aria-hidden
                            />
                            <span className="font-medium" style={{ color: g.color }}>{g.label}</span>
                            <span className="text-muted-foreground">({g.items.length})</span>
                          </div>
                          <span className="tabular-nums text-foreground font-medium">{formatFee(g.total)}</span>
                        </div>
                        {g.items.length === 0 ? (
                          <div className="pl-5 text-xs text-muted-foreground">No deals</div>
                        ) : (
                          <ul className="pl-5 space-y-1 list-disc marker:text-muted-foreground">
                            {g.items.map((d) => (
                              <li key={d.id} className="text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <Link
                                    to={`/deals/${d.id}`}
                                    onClick={() => onOpenChange(false)}
                                    className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20 hover:border-primary/50 transition-colors"
                                  >
                                    {d.name}
                                  </Link>
                                  <span className="tabular-nums text-muted-foreground text-xs">
                                    {formatFee(d.fee)}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 text-sm">
                <div><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{report.subject}</span></div>
                <div><span className="text-muted-foreground">Sent:</span> {format(new Date(report.created_at), 'PPpp')}</div>
                {report.sender_name && (
                  <div><span className="text-muted-foreground">From:</span> {report.sender_name}{report.sender_email ? ` <${report.sender_email}>` : ''}</div>
                )}
                <div><span className="text-muted-foreground">To:</span> {report.recipients.join(', ') || '—'}</div>
                {report.cc?.length > 0 && (
                  <div><span className="text-muted-foreground">Cc:</span> {report.cc.join(', ')}</div>
                )}
              </div>
              <div className="rounded-md border border-border/60 bg-background p-4 space-y-5">
                {parsed?.introHtml && (
                  <div
                    className="prose prose-sm max-w-none prose-invert"
                    dangerouslySetInnerHTML={{ __html: parsed.introHtml }}
                  />
                )}
                {parsed?.groups.map((g) => (
                  <div key={g.label} className="space-y-2">
                    <div className="text-sm font-semibold" style={{ color: g.color }}>
                      {g.label} <span className="text-muted-foreground font-normal">({g.items.length})</span>
                    </div>
                    <ul className="space-y-1.5 list-disc pl-5 marker:text-muted-foreground">
                      {g.items.map((it, idx) => {
                        const dealId = dealIdByName.get(it.dealName.trim().toLowerCase());
                        const nameEl = dealId ? (
                          <Link
                            to={`/deals/${dealId}`}
                            onClick={() => onOpenChange(false)}
                            className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20 hover:border-primary/50 transition-colors"
                          >
                            {it.dealName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-foreground">{it.dealName}</span>
                        );
                        return (
                          <li key={`${g.label}-${idx}`} className="text-sm leading-relaxed">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {nameEl}
                              {it.amount && (
                                <span className="tabular-nums font-medium text-foreground">{it.amount}</span>
                              )}
                              {it.stage && (
                                <span className="text-xs rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                                  {it.stage}
                                </span>
                              )}
                            </div>
                            {it.note && (
                              <div className="mt-0.5 text-sm text-muted-foreground">{it.note}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {parsed?.outroHtml && (
                  <div
                    className="prose prose-sm max-w-none prose-invert"
                    dangerouslySetInnerHTML={{ __html: parsed.outroHtml }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}