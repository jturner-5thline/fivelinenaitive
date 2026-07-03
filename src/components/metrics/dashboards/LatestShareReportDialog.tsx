import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

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

export function LatestShareReportDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<LatestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            The most recent Share Report sent from the Deals page.
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
              <div
                className="rounded-md border border-border/60 bg-background p-4 prose prose-sm max-w-none prose-invert"
                dangerouslySetInnerHTML={{ __html: report.body_html }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}