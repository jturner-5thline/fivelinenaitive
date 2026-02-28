import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, X, Check, AtSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReportComment {
  id: string;
  section_id: string;
  content: string;
  user_id: string;
  user_display_name: string | null;
  parent_comment_id: string | null;
  mentioned_user_ids: string[] | null;
  resolved: boolean;
  created_at: string;
}

interface ReportCollaborationProps {
  dealId: string;
  sectionId: string;
  sectionTitle: string;
  className?: string;
}

export function ReportCollaboration({ dealId, sectionId, sectionTitle, className }: ReportCollaborationProps) {
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const fetchComments = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('diligence_report_comments')
      .select('*')
      .eq('deal_id', dealId)
      .eq('section_id', sectionId)
      .order('created_at', { ascending: true });
    setComments((data || []) as ReportComment[]);
    setIsLoading(false);
  }, [dealId, sectionId]);

  useEffect(() => {
    if (isOpen) fetchComments();
  }, [isOpen, fetchComments]);

  const addComment = useCallback(async () => {
    if (!newComment.trim()) return;
    setIsSending(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Please sign in'); setIsSending(false); return; }

    // Extract @mentions
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(newComment)) !== null) {
      mentions.push(match[1]);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase
      .from('diligence_report_comments')
      .insert({
        deal_id: dealId,
        section_id: sectionId,
        content: newComment.trim(),
        user_id: user.id,
        user_display_name: profile?.display_name || user.email?.split('@')[0] || 'User',
      });

    if (error) {
      toast.error('Failed to add comment');
    } else {
      setNewComment('');
      await fetchComments();
    }
    setIsSending(false);
  }, [newComment, dealId, sectionId, fetchComments]);

  const resolveComment = useCallback(async (commentId: string) => {
    const { error } = await supabase
      .from('diligence_report_comments')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', commentId);

    if (!error) {
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c));
    }
  }, []);

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors",
          unresolvedCount > 0 ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
        )}
      >
        <MessageSquare className="h-3 w-3" />
        {unresolvedCount > 0 && <span>{unresolvedCount}</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-6 z-50 w-80 rounded-xl border border-border/40 bg-card shadow-xl">
          <div className="flex items-center justify-between p-3 border-b border-border/20">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">{sectionTitle}</span>
              {unresolvedCount > 0 && (
                <Badge variant="outline" className="text-[9px] h-4">{unresolvedCount} open</Badge>
              )}
            </div>
            <button onClick={() => setIsOpen(false)}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">No comments yet</p>
            ) : (
              comments.map(comment => (
                <div
                  key={comment.id}
                  className={cn(
                    "rounded-lg p-2 text-xs",
                    comment.resolved ? "bg-muted/20 opacity-60" : "bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[10px]">{comment.user_display_name || 'User'}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                      {!comment.resolved && (
                        <button
                          onClick={() => resolveComment(comment.id)}
                          className="text-muted-foreground hover:text-emerald-500 transition-colors"
                          title="Resolve"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed">{comment.content}</p>
                  {comment.resolved && (
                    <Badge variant="outline" className="text-[8px] mt-1 text-emerald-500 border-emerald-500/30">Resolved</Badge>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-border/20">
            <div className="flex items-center gap-1.5">
              <input
                className="flex-1 text-xs bg-muted/20 border border-border/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                placeholder="Add comment… Use @ to mention"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
              />
              <Button
                size="sm"
                className="h-7 w-7 p-0"
                onClick={addComment}
                disabled={!newComment.trim() || isSending}
              >
                {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
