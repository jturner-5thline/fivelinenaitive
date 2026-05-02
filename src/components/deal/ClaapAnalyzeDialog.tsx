import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check, Plus, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';

interface SuggestedTask {
  key: string;
  title: string;
  owner_label: string;
  due_hint: string | null;
  priority: 'low' | 'medium' | 'high';
}

interface AnalyzeResult {
  ok: boolean;
  activity_log_id: string;
  summary_markdown: string;
  suggested_tasks: SuggestedTask[];
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
  const [creating, setCreating] = useState<Record<string, 'pending' | 'creating' | 'done'>>({});

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
          },
        });
        if (cancelled) return;
        if (invokeErr) throw new Error(invokeErr.message || 'Analysis failed');
        if (!data?.ok) throw new Error((data as any)?.error || 'Analysis failed');
        setResult(data as AnalyzeResult);
        // Refresh the deal's activity feed so the Activity tab shows the new note.
        queryClient.invalidateQueries({ queryKey: ['deal-activity', dealId] });
        queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
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

  const createTask = async (task: SuggestedTask) => {
    setCreating(prev => ({ ...prev, [task.key]: 'creating' }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      // Naive due_date heuristic from due_hint — never invent dates.
      let due_date: string | null = null;
      const hint = (task.due_hint || '').toLowerCase();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const addDays = (n: number) => {
        const d = new Date(today); d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      if (/\btomorrow\b/.test(hint) || /\beod tomorrow\b/.test(hint)) due_date = addDays(1);
      else if (/\btoday\b|\beod\b/.test(hint)) due_date = addDays(0);
      else if (/\bnext week\b/.test(hint)) due_date = addDays(7);
      else if (/\bthis week\b|\bby friday\b|\bend of week\b/.test(hint)) {
        const dow = today.getDay(); // Sun=0..Sat=6
        const toFri = (5 - dow + 7) % 7 || 5;
        due_date = addDays(toFri);
      } else if (/\bnext month\b/.test(hint)) due_date = addDays(30);

      const { error: insErr } = await supabase.from('tasks').insert({
        deal_id: dealId,
        assigned_to: user.id,
        assigned_by: user.id,
        title: task.title,
        description: `Suggested by naitive AI from Claap recording: ${recordingTitle}${task.owner_label ? `\nOriginal owner mentioned: ${task.owner_label}` : ''}${task.due_hint ? `\nDue hint: ${task.due_hint}` : ''}`,
        priority: task.priority || 'medium',
        status: 'not_started',
        task_type: 'task',
        due_date,
      });
      if (insErr) throw insErr;

      setCreating(prev => ({ ...prev, [task.key]: 'done' }));
      toast({ title: 'Task created', description: task.title });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['deal-tasks', dealId] });
    } catch (e: any) {
      setCreating(prev => ({ ...prev, [task.key]: 'pending' }));
      toast({ title: 'Failed to create task', description: e?.message || 'Try again', variant: 'destructive' });
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
                <h3 className="text-sm font-semibold mb-2">
                  Suggested Tasks
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({result.suggested_tasks.length}) — click <Plus className="inline h-3 w-3" /> to create each one
                  </span>
                </h3>

                {result.suggested_tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No action items extracted from this recording.</p>
                ) : (
                  <div className="space-y-2">
                    {result.suggested_tasks.map((t) => {
                      const state = creating[t.key] || 'pending';
                      return (
                        <div key={t.key} className="flex items-start gap-3 p-3 rounded-md border bg-card">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">Owner: {t.owner_label}</Badge>
                              {t.due_hint && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {t.due_hint}
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
                            variant={state === 'done' ? 'secondary' : 'default'}
                            disabled={state !== 'pending'}
                            onClick={() => createTask(t)}
                          >
                            {state === 'creating' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                              state === 'done' ? <><Check className="h-3.5 w-3.5 mr-1" /> Created</> :
                              <><Plus className="h-3.5 w-3.5 mr-1" /> Create task</>}
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