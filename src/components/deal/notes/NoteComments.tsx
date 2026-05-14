import { useState, useEffect, useCallback, useRef } from 'react';
import { NoteComment } from '@/hooks/useDealSpaceNotes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Check, Trash2, Send, Eye, EyeOff, CornerDownRight } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface NoteCommentsProps {
  noteId: string;
  dealId: string;
  noteTitle: string;
  fetchComments: (noteId: string) => Promise<NoteComment[]>;
  addComment: (noteId: string, content: string, quoteText?: string, parentCommentId?: string) => Promise<NoteComment | null>;
  resolveComment: (commentId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  pendingQuote?: string | null;
  onPendingQuoteConsumed?: () => void;
}

function Avatar({ url, name }: { url?: string | null; name?: string }) {
  if (url) return <img src={url} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />;
  return (
    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium text-primary shrink-0">
      {(name?.[0] || '?').toUpperCase()}
    </div>
  );
}

export function NoteComments({
  noteId, dealId, noteTitle,
  fetchComments, addComment, resolveComment, deleteComment,
  pendingQuote, onPendingQuoteConsumed,
}: NoteCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [draftQuote, setDraftQuote] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const newInputRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const data = await fetchComments(noteId);
    setComments(data);
    setLoading(false);
  }, [noteId, fetchComments]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Pre-fill from editor's "Add comment" selection
  useEffect(() => {
    if (pendingQuote) {
      setDraftQuote(pendingQuote);
      setReplyTo(null);
      setTimeout(() => newInputRef.current?.focus(), 50);
      onPendingQuoteConsumed?.();
    }
  }, [pendingQuote, onPendingQuoteConsumed]);

  const notifyParticipants = async (parentId: string, text: string) => {
    if (!user) return;
    try {
      const thread = comments.filter(c => c.id === parentId || c.parent_comment_id === parentId);
      const participantIds = new Set<string>();
      thread.forEach(c => { if (c.user_id !== user.id) participantIds.add(c.user_id); });
      if (!participantIds.size) return;

      const { data: deal } = await supabase
        .from('deals')
        .select('company')
        .eq('id', dealId)
        .maybeSingle();

      const company = (deal as any)?.company || 'a deal';
      const rows = Array.from(participantIds).map(uid => ({
        user_id: uid,
        deal_id: dealId,
        alert_type: 'comment_reply',
        title: `${company}: New reply on "${noteTitle}"`,
        message: `${user.email} replied to a comment on "${noteTitle}".`,
      }));
      await supabase.from('flex_notifications').insert(rows as any);
    } catch (e) {
      console.error('Comment reply notification failed:', e);
    }
  };

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    const comment = await addComment(noteId, newComment.trim(), draftQuote || undefined);
    if (comment) {
      setComments(prev => [...prev, comment]);
      setNewComment('');
      setDraftQuote(null);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    const comment = await addComment(noteId, replyText.trim(), undefined, parentId);
    if (comment) {
      setComments(prev => [...prev, comment]);
      setReplyText('');
      setReplyTo(null);
      void notifyParticipants(parentId, replyText.trim());
    }
  };

  const handleResolve = async (id: string) => {
    await resolveComment(id);
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: true } : c));
  };

  const handleDelete = async (id: string) => {
    await deleteComment(id);
    setComments(prev => prev.filter(c => c.id !== id && c.parent_comment_id !== id));
  };

  // Group as threads (only top-level + their replies)
  const topLevel = comments.filter(c => !c.parent_comment_id);
  const repliesByParent: Record<string, NoteComment[]> = {};
  comments.filter(c => c.parent_comment_id).forEach(r => {
    if (!repliesByParent[r.parent_comment_id!]) repliesByParent[r.parent_comment_id!] = [];
    repliesByParent[r.parent_comment_id!].push(r);
  });

  const visibleThreads = topLevel.filter(t => showResolved || !t.resolved);
  const unresolvedCount = topLevel.filter(t => !t.resolved).length;
  const resolvedCount = topLevel.filter(t => t.resolved).length;

  const renderComment = (c: NoteComment, isReply: boolean) => (
    <div key={c.id} className={cn("space-y-1", c.resolved && "opacity-60")}>
      <div className="flex items-start gap-2">
        <Avatar url={c.author_avatar_url} name={c.author_display_name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{c.author_display_name || 'Unknown'}</span>
            <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'MMM d, h:mm a')}</span>
          </div>
          <p className={cn("text-xs mt-0.5 whitespace-pre-wrap break-words", c.resolved && "line-through")}>{c.content}</p>
        </div>
        {!isReply && !c.resolved && (
          <Button size="icon" variant="ghost" className="h-5 w-5" title="Resolve" onClick={() => handleResolve(c.id)}>
            <Check className="h-3 w-3" />
          </Button>
        )}
        {c.user_id === user?.id && (
          <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" title="Delete" onClick={() => handleDelete(c.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-72 border-l flex flex-col shrink-0 bg-background">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-medium">Comments</span>
        <span className="text-xs text-muted-foreground ml-auto">{unresolvedCount}</span>
        {resolvedCount > 0 && (
          <Button size="icon" variant="ghost" className="h-6 w-6" title={showResolved ? 'Hide resolved' : 'Show resolved'} onClick={() => setShowResolved(s => !s)}>
            {showResolved ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading…</p>
        ) : visibleThreads.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No comments yet. Select text in the note and click "Add comment".</p>
        ) : (
          <div className="p-2 space-y-3">
            {visibleThreads.map(thread => (
              <div key={thread.id} className="rounded-md border bg-card p-2 space-y-2">
                {thread.quote_text && (
                  <div className="border-l-2 border-primary/40 pl-2 text-muted-foreground italic text-[11px] line-clamp-2">"{thread.quote_text}"</div>
                )}
                {renderComment(thread, false)}
                {(repliesByParent[thread.id] || []).map(r => (
                  <div key={r.id} className="ml-4 pl-2 border-l border-border">
                    {renderComment(r, true)}
                  </div>
                ))}
                {!thread.resolved && (
                  <div className="ml-4 pl-2 border-l border-border/50">
                    {replyTo === thread.id ? (
                      <div className="flex flex-col gap-1">
                        <Textarea
                          autoFocus
                          rows={2}
                          placeholder="Reply…"
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          className="text-xs min-h-0 py-1.5"
                        />
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setReplyTo(null); setReplyText(''); }}>Cancel</Button>
                          <Button size="sm" className="h-6 text-xs" onClick={() => handleReply(thread.id)} disabled={!replyText.trim()}>Reply</Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1 text-muted-foreground" onClick={() => { setReplyTo(thread.id); setReplyText(''); }}>
                        <CornerDownRight className="h-3 w-3" /> Reply
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t space-y-1.5">
        {draftQuote && (
          <div className="flex items-start gap-1 text-[11px] border-l-2 border-primary/40 pl-2 text-muted-foreground italic">
            <span className="line-clamp-2 flex-1">"{draftQuote}"</span>
            <Button size="icon" variant="ghost" className="h-4 w-4 shrink-0" onClick={() => setDraftQuote(null)}>
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        )}
        <div className="flex items-end gap-1">
          <Textarea
            ref={newInputRef}
            placeholder={draftQuote ? 'Comment on selection…' : 'Add comment…'}
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
            rows={2}
            className="text-xs min-h-0 py-1.5 flex-1 resize-none"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleAdd} disabled={!newComment.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
