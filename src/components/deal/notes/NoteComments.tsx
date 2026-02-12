import { useState, useEffect, useCallback } from 'react';
import { NoteComment } from '@/hooks/useDealSpaceNotes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Check, Trash2, Send } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface NoteCommentsProps {
  noteId: string;
  fetchComments: (noteId: string) => Promise<NoteComment[]>;
  addComment: (noteId: string, content: string, quoteText?: string) => Promise<NoteComment | null>;
  resolveComment: (commentId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

export function NoteComments({ noteId, fetchComments, addComment, resolveComment, deleteComment }: NoteCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const data = await fetchComments(noteId);
    setComments(data);
    setLoading(false);
  }, [noteId, fetchComments]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    const comment = await addComment(noteId, newComment.trim());
    if (comment) {
      setComments(prev => [...prev, comment]);
      setNewComment('');
    }
  };

  const handleResolve = async (id: string) => {
    await resolveComment(id);
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: true } : c));
  };

  const handleDelete = async (id: string) => {
    await deleteComment(id);
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const unresolvedComments = comments.filter(c => !c.resolved);
  const resolvedComments = comments.filter(c => c.resolved);

  return (
    <div className="w-64 border-l flex flex-col shrink-0">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-medium">Comments</span>
        <span className="text-xs text-muted-foreground ml-auto">{unresolvedComments.length}</span>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="p-2 space-y-2">
            {unresolvedComments.map(c => (
              <div key={c.id} className="rounded-md border p-2 text-xs space-y-1">
                {c.quote_text && (
                  <div className="border-l-2 border-primary/30 pl-2 text-muted-foreground italic text-[11px] line-clamp-2">"{c.quote_text}"</div>
                )}
                <p>{c.content}</p>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px]">{format(new Date(c.created_at), 'MMM d, h:mm a')}</span>
                  <div className="flex items-center gap-0.5">
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleResolve(c.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    {c.user_id === user?.id && (
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {resolvedComments.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider pt-2">Resolved</p>
                {resolvedComments.map(c => (
                  <div key={c.id} className="rounded-md border p-2 text-xs opacity-50 space-y-1">
                    <p className="line-through">{c.content}</p>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'MMM d')}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>
      <div className="p-2 border-t flex items-center gap-1">
        <Input
          placeholder="Add comment…"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          className="h-7 text-xs"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleAdd} disabled={!newComment.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
