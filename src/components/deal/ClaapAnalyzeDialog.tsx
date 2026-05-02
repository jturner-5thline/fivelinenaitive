import { useEffect, useState, useMemo } from 'react';
import { Sparkles, Loader2, Check, Calendar, ExternalLink, Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';

interface ActionItem {
  owner: string;
  title: string;
  due_hint?: string;
  priority?: 'low' | 'medium' | 'high';
}

interface SuggestedTask {
  key: string;
  title: string;
  owner_label: string;
  due_hint: string | null;
  priority: 'low' | 'medium' | 'high';
  inferred_due_date: string | null;
}

interface DraftResult {
  ok: boolean;
  action: 'draft';
  already_posted: boolean;
  already_posted_activity_id: string | null;
  summary_markdown: string;
  insights: {
    action_items: ActionItem[];
    [k: string]: any;
  };
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

export function ClaapAnalyzeDialog({
  open, onClose, dealId, recordingId, recordingTitle, recordingUrl, recordedAt,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<Set<string>>(new Set());
  const [postedSummary, setPostedSummary] = useState(false);

  // Generate the DRAFT (no DB writes) when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setDraft(null);
      setPostedSummary(false);
      setSelectedTaskKeys(new Set());
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('claap-deal-analyze', {
          body: {
            action: 'draft',
            deal_id: dealId,
            recording_id: recordingId,
            recording_title: recordingTitle,
            recording_url: recordingUrl,
            recorded_at: recordedAt,
          },
        });
        if (cancelled) return;
        if (invokeErr) throw new Error(invokeErr.message || 'Analysis failed');
        if (!data?.ok) throw new Error((data as any)?.error || 'Analysis failed');
        const d = data as DraftResult;
        setDraft(d);
        // Pre-select all suggested tasks so a single click creates them.
        setSelectedTaskKeys(new Set((d.suggested_tasks || []).map(t => t.key)));
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Analysis failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dealId, recordingId, recordingTitle, recordingUrl, recordedAt]);

  const toggleTask = (key: string) => {
    setSelectedTaskKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const confirmedActionItems = useMemo(() => {
    if (!draft) return [];
    return draft.suggested_tasks
      .filter(t => selectedTaskKeys.has(t.key))
      .map<ActionItem>(t => ({
        title: t.title,
        owner: t.owner_label,
        due_hint: t.due_hint || undefined,
        priority: t.priority,
      }));
  }, [draft, selectedTaskKeys]);

  const handlePost = async () => {
    if (!draft) return;
    setPosting(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('claap-deal-analyze', {
        body: {
          action: 'post',
          deal_id: dealId,
          recording_id: recordingId,
          recording_title: recordingTitle,
          recording_url: recordingUrl,
          recorded_at: recordedAt,
          summary_markdown: draft.summary_markdown,
          insights: draft.insights,
          confirmed_action_items: confirmedActionItems,
        },
      });
      if (invokeErr) throw new Error(invokeErr.message || 'Failed to post');
      if (!data?.ok) throw new Error((data as any)?.error || 'Failed to post');

      const createdCount = (data as any).created_tasks?.length || 0;
      toast({
        title: 'Summary posted to Activity',
        description: createdCount > 0
          ? `${createdCount} task${createdCount === 1 ? '' : 's'} created.`
          : 'No tasks were created.',
      });

      queryClient.invalidateQueries({ queryKey: ['deal-activity', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deal-tasks', dealId] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      window.dispatchEvent(new CustomEvent('claap-recording-analyzed', {
        detail: { dealId, recordingId },
      }));
      setPostedSummary(true);
    } catch (e: any) {
      toast({
        title: 'Failed to post summary',
        description: e?.message || 'Try again',
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  };

  const alreadyPosted = !!draft?.already_posted && !postedSummary;
  const canPost = !!draft && !posting && !postedSummary && !alreadyPosted;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Review AI Draft
          </DialogTitle>
          <DialogDescription className="truncate">{recordingTitle}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Reading the transcript and extracting deal terms…</p>
            <p className="text-xs">Nothing is saved until you click Post.</p>
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

        {draft && !loading && (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-5">
              {alreadyPosted && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    A summary for this recording has already been posted to Activity.
                    Posting again is disabled to avoid duplicates.
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">
                    Draft summary {postedSummary && <Badge variant="secondary" className="ml-2 text-[10px]">Posted</Badge>}
                  </h3>
                  {recordingUrl && (
                    <Button variant="ghost" size="sm" onClick={() => window.open(recordingUrl, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in Claap
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Review the draft below. It will only appear on the Activity tab once you click <strong>Post to Activity</strong>.
                </p>
                <div className="prose prose-sm max-w-none text-foreground rounded-md border bg-muted/20 p-4 [&_table]:my-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_p]:my-1 [&_ul]:my-1">
                  <ReactMarkdown>{draft.summary_markdown}</ReactMarkdown>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Suggested Tasks
                  <span className="text-xs font-normal text-muted-foreground">
                    ({selectedTaskKeys.size} of {draft.suggested_tasks.length} selected)
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Pick the action items you want to create as naitive tasks. Tasks are only created when you post.
                </p>

                {draft.suggested_tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No action items extracted from this recording.</p>
                ) : (
                  <div className="space-y-2">
                    {draft.suggested_tasks.map((t) => {
                      const checked = selectedTaskKeys.has(t.key);
                      return (
                        <label
                          key={t.key}
                          className="flex items-start gap-3 p-3 rounded-md border bg-card cursor-pointer hover:bg-muted/30 transition"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleTask(t.key)}
                            disabled={postedSummary}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">Owner: {t.owner_label}</Badge>
                              {t.inferred_due_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Due {t.inferred_due_date}
                                </span>
                              )}
                              {t.due_hint && !t.inferred_due_date && (
                                <span className="italic">"{t.due_hint}"</span>
                              )}
                              {t.priority && t.priority !== 'medium' && (
                                <Badge variant={t.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">
                                  {t.priority}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-between items-center pt-2 border-t gap-2">
          <p className="text-xs text-muted-foreground">
            {postedSummary
              ? 'Summary and selected tasks have been saved.'
              : 'AI draft — nothing is saved until you confirm.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {postedSummary ? 'Close' : 'Discard'}
            </Button>
            {!postedSummary && (
              <Button onClick={handlePost} disabled={!canPost}>
                {posting
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Posting…</>
                  : <><Send className="h-3.5 w-3.5 mr-1.5" /> Post to Activity{selectedTaskKeys.size > 0 ? ` + ${selectedTaskKeys.size} task${selectedTaskKeys.size === 1 ? '' : 's'}` : ''}</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
