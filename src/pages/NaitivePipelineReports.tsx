import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { DashboardPage } from '@/components/layout/DashboardPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, FileX, ExternalLink } from 'lucide-react';

interface ReportListRow {
  id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  recipients: string[];
  period_label: string | null;
  created_at: string;
  email_sent: boolean;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' ET';
  } catch {
    return iso;
  }
}

export default function NaitivePipelineReports() {
  const { hasAccess, isLoading: accessLoading } = useNaitivePipelineAccess();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReportListRow[]>([]);

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('naitive_pipeline_reports' as any)
        .select('id, submitter_name, submitter_email, recipients, period_label, created_at, email_sent')
        .order('created_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (!error && data) setRows(data as unknown as ReportListRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [hasAccess]);

  if (accessLoading) return null;
  if (!hasAccess) return <Navigate to="/" replace />;

  return (
    <>
      <Helmet>
        <title>Submitted Reports | naitive</title>
      </Helmet>
      <DashboardPage
        padding="sm"
        header={
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Submitted Reports</h1>
              <p className="text-sm text-muted-foreground mt-1">
                History of naitive Pipeline Report snapshots
              </p>
            </div>
            <Link to="/naitive-pipeline">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Pipeline
              </Button>
            </Link>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <FileX className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No reports submitted yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Submitted reports will appear here once you submit the first snapshot from the naitive Pipeline page.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to={`/naitive-pipeline/reports/${r.id}`}
                className="block rounded-xl border border-border/60 bg-card/40 hover:bg-card/70 transition-colors p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{formatDateTime(r.created_at)}</span>
                      {r.email_sent ? (
                        <Badge variant="outline" className="text-[10px]">Email sent</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">Email pending</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground space-y-0.5">
                      <div>
                        <span className="text-foreground/80">{r.submitter_name || r.submitter_email || 'Unknown'}</span>
                        {r.period_label && <span> · {r.period_label}</span>}
                      </div>
                      <div className="text-xs truncate">
                        To: {(r.recipients || []).join(', ') || '—'}
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </DashboardPage>
    </>
  );
}