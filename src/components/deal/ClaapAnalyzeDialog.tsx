import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check, Calendar, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';

interface CreatedTask {
  id: string;
  title: string;
  owner_label: string;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
}

interface AnalyzeResult {
  ok: boolean;
  activity_log_id: string;
  summary_markdown: string;
  created_tasks: CreatedTask[];
  auto_created: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dealId: string;
  recordingId: string;
  recordingTitle: string;
  recordingUrl: string | null;
  recordedAt: string | null;
}

export function ClaapAnalyzeDialog({ open, onClose, dealId, recordingId, recordingTitle, recordingUrl, recordedAt }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(new Set());

  // Run the analysis when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('claap-deal-analyze', {
          body: {
            deal_id: dealId,
            recording_id: recordingId,
            recording_title: recordingTitle,
            recording_url: recordingUrl,
            recorded_at: recordedAt,
            skip_if_exists: false,
            auto_create_tasks: true,
          },
        });
        if (cancelled) return;
        if (invokeErr) throw new Error(invokeErr.message || 'Analysis failed');
        if (!data?.ok) throw new Error((data as any)?.error || 'Analysis failed');
        setResult(data as AnalyzeResult);
        // Refresh the deal's activity feed so the Activity tab shows the new note.
        queryClient.invalidateQueries({ queryKey: ['deal-activity', dealId] });
        queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        queryClient.invalidateQueries({ queryKey: ['deal-tasks', dealId] });
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        window.dispatchEvent(new CustomEvent('claap-recording-analyzed', {
          detail: { dealId, recordingId },
        }));
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Analysis failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dealId, recordingId, recordingTitle, recordingUrl, recordedAt, queryClient]);

  const deleteTask = async (taskId: string) => {
    setDeletingTaskId(taskId);
    try {
      const { error: delErr } = await supabase.from('tasks').delete().eq('id', taskId);
      if (delErr) throw delErr;
      setDeletedTaskIds(prev => { const next = new Set(prev); next.add(taskId); return next; });
      toast({ title: 'Task deleted' });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['deal-tasks', dealId] });
    } catch (e: any) {
      toast({ title: 'Failed to delete task', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setDeletingTaskId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Analyze Recording
          </DialogTitle>
          <DialogDescription className="truncate">{recordingTitle}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Reading the transcript and extracting deal terms…</p>
          </div>
        )}

        {error && !loading && (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              The transcript may not be available yet. Claap usually finalizes transcripts a few minutes after a meeting ends.
            </p>
          </div>
        )}

        {result && !loading && (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Summary posted to Activity</h3>
                  {recordingUrl && (
                    <Button variant="ghost" size="sm" onClick={() => window.open(recordingUrl, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in Claap
                    </Button>
                  )}
                </div>
                <div className="prose prose-sm max-w-none text-foreground rounded-md border bg-muted/20 p-4 [&_table]:my-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_p]:my-1 [&_ul]:my-1">
                  <ReactMarkdown>{result.summary_markdown}</ReactMarkdown>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Tasks Auto-Created
                  <span className="text-xs font-normal text-muted-foreground">
                    ({result.created_tasks?.length || 0}) — delete any that aren't useful
                  </span>
                </h3>

                {!result.created_tasks || result.created_tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No action items extracted from this recording.</p>
                ) : (
                  <div className="space-y-2">
                    {result.created_tasks.map((t) => {
                      const isDeleted = deletedTaskIds.has(t.id);
                      return (
                        <div key={t.id} className={"flex items-start gap-3 p-3 rounded-md border bg-card " + (isDeleted ? "opacity-50" : "")}>
                          <div className="flex-1 min-w-0">
                            <p className={"text-sm font-medium leading-snug " + (isDeleted ? "line-through" : "")}>{t.title}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">Owner: {t.owner_label}</Badge>
                              {t.due_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Due {t.due_date}
                                </span>
                              )}
                              {t.priority && t.priority !== 'medium' && (
                                <Badge variant={t.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">
                                  {t.priority}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isDeleted || deletingTaskId === t.id}
                            onClick={() => deleteTask(t.id)}
                          >
                            {deletingTaskId === t.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : isDeleted
                                ? <><Check className="h-3.5 w-3.5 mr-1" /> Removed</>
                                : <><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</>}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}