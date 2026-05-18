import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { DashboardPage } from '@/components/layout/DashboardPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, FileX, Mail, Clock, User, Lock } from 'lucide-react';

interface ReportRow {
  id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  recipients: string[];
  period_type: string | null;
  period_key: string | null;
  period_label: string | null;
  filters: any;
  snapshot: any;
  email_sent: boolean;
  email_error: string | null;
  created_at: string;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'long',
      timeStyle: 'short',
    }) + ' ET';
  } catch {
    return iso;
  }
}

function formatUSD(n: number) {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function NaitivePipelineReportView() {
  const { id } = useParams<{ id: string }>();
  const { hasAccess, isLoading: accessLoading } = useNaitivePipelineAccess();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('naitive_pipeline_reports' as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else if (!data) {
        setError('Report not found');
      } else {
        setReport(data as unknown as ReportRow);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (accessLoading) return null;
  if (!hasAccess) return <Navigate to="/" replace />;

  return (
    <>
      <Helmet>
        <title>Submitted Report | naitive</title>
      </Helmet>
      <DashboardPage
        padding="sm"
        header={
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Lock className="h-3 w-3" />
                Read-only snapshot
              </div>
              <h1 className="text-2xl font-bold tracking-tight">naitive Pipeline Report</h1>
              {report?.period_label && (
                <p className="text-sm text-muted-foreground mt-1">{report.period_label}</p>
              )}
            </div>
            <Link to="/naitive-pipeline/reports">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                All submitted reports
              </Button>
            </Link>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !report ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <FileX className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Report not available</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {error || 'This report could not be loaded.'}
            </p>
          </div>
        ) : (
          <ReportSnapshotContent report={report} />
        )}
      </DashboardPage>
    </>
  );
}

function ReportSnapshotContent({ report }: { report: ReportRow }) {
  const snapshot = report.snapshot || {};
  const metrics = snapshot.metrics || {};
  const stageCounts: Array<{ stage: string; label: string; count: number }> = snapshot.stageCounts || [];
  const deals: any[] = snapshot.deals || [];
  const narrative: string = snapshot.narrative || '';

  return (
    <div className="space-y-6">
      {/* Header meta */}
      <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <User className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <div className="text-xs text-muted-foreground">Submitted by</div>
            <div className="font-medium">{report.submitter_name || report.submitter_email || 'Unknown'}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <div className="text-xs text-muted-foreground">Submitted at</div>
            <div className="font-medium">{formatDateTime(report.created_at)}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <div className="text-xs text-muted-foreground">Recipients</div>
            <div className="font-medium text-xs leading-relaxed">
              {(report.recipients || []).join(', ') || '—'}
            </div>
            {report.email_sent ? (
              <Badge variant="outline" className="mt-1 text-[10px]">Email sent</Badge>
            ) : (
              <Badge variant="outline" className="mt-1 text-[10px] text-amber-600 border-amber-500/40">
                Email pending
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Deals in report" value={String(metrics.filteredCount ?? deals.length)} />
        <MetricTile label="Total pipeline" value={String(metrics.totalDeals ?? '—')} />
        <MetricTile label="Pipeline value" value={formatUSD(Number(metrics.totalValue) || 0)} />
        <MetricTile label="Active filters" value={String(countActiveFilters(report.filters))} />
      </div>

      {/* Stage breakdown */}
      {stageCounts.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-sm font-semibold mb-3">Stage breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {stageCounts.map((s) => (
              <div key={s.stage} className="rounded-md border border-border/40 bg-background/40 p-2.5">
                <div className="text-xs text-muted-foreground truncate" title={s.label}>{s.label}</div>
                <div className="text-lg font-semibold">{s.count}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Narrative */}
      {narrative && (
        <section className="rounded-xl border border-border/60 bg-card/40 p-4">
          <h2 className="text-sm font-semibold mb-3">Narrative</h2>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: narrative }}
          />
        </section>
      )}

      {/* Filters */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h2 className="text-sm font-semibold mb-3">Filters at submit time</h2>
        <FilterSummary filters={report.filters} />
      </section>

      {/* Deals table */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h2 className="text-sm font-semibold mb-3">Deals ({deals.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-3">Deal</th>
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3">Owner</th>
                <th className="py-2 pr-3 text-right">Value</th>
                <th className="py-2 pr-3">Closing</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No deals captured</td></tr>
              ) : deals.map((d) => (
                <tr key={d.id} className="border-b border-border/20 last:border-0">
                  <td className="py-2 pr-3 font-medium truncate max-w-[220px]" title={d.name}>{d.name || '—'}</td>
                  <td className="py-2 pr-3 text-xs">{snapshot.stageLabels?.[d.stage] || d.stage}</td>
                  <td className="py-2 pr-3 text-xs">{d.manager || '—'}</td>
                  <td className="py-2 pr-3 text-right">{formatUSD(Number(d.value) || 0)}</td>
                  <td className="py-2 pr-3 text-xs">{d.closingDate ? new Date(d.closingDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function countActiveFilters(f: any): number {
  if (!f || typeof f !== 'object') return 0;
  let n = 0;
  for (const k of ['owner', 'icp', 'stage', 'source', 'outcome']) {
    if (Array.isArray(f[k])) n += f[k].length;
  }
  if (f.dateRange && f.dateRange !== 'all') n += 1;
  if (f.activeOnly) n += 1;
  return n;
}

function FilterSummary({ filters }: { filters: any }) {
  if (!filters || typeof filters !== 'object') {
    return <p className="text-sm text-muted-foreground">No filter state captured.</p>;
  }
  const rows: Array<[string, string]> = [];
  for (const [k, label] of [
    ['owner', 'Owner'],
    ['icp', 'ICP'],
    ['stage', 'Stage'],
    ['source', 'Source'],
    ['outcome', 'Outcome'],
  ] as const) {
    const arr = filters[k];
    if (Array.isArray(arr) && arr.length) rows.push([label, arr.join(', ')]);
  }
  if (filters.dateRange && filters.dateRange !== 'all') {
    rows.push(['Date range', `${filters.dateRange} (${filters.dateField || 'created'})`]);
  }
  if (filters.activeOnly) rows.push(['Scope', 'Active stages only']);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No filters were applied.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 rounded-md border border-border/30 bg-background/30 px-3 py-2">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium truncate text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}