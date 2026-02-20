import { useState } from 'react';
import { MessageSquare, Send, Trash2, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatRelativeTime } from './helpers';
import type { DataRoomComment } from '@/hooks/useDataRoomComments';

interface CommentsThreadProps {
  comments: DataRoomComment[];
  checklistItemId: string;
  onAddComment: (itemId: string, content: string, parentId?: string) => Promise<boolean>;
  onDeleteComment: (commentId: string) => Promise<boolean>;
  currentUserId?: string;
}

export function CommentsThread({
  comments, checklistItemId, onAddComment, onDeleteComment, currentUserId,
}: CommentsThreadProps) {
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const itemComments = comments.filter(c => c.checklist_item_id === checklistItemId);
  const topLevel = itemComments.filter(c => !c.parent_comment_id);
  const replies = (parentId: string) => itemComments.filter(c => c.parent_comment_id === parentId);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setIsSubmitting(true);
    const ok = await onAddComment(checklistItemId, newComment.trim(), replyTo || undefined);
    if (ok) { setNewComment(''); setReplyTo(null); }
    setIsSubmitting(false);
  };

  const initials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const renderComment = (comment: DataRoomComment, isReply = false) => (
    <div key={comment.id} className={`flex gap-2 ${isReply ? 'ml-6' : ''}`}>
      <Avatar className="h-6 w-6 shrink-0 mt-0.5">
        <AvatarImage src={comment.user_avatar_url} />
        <AvatarFallback className="text-[9px]">{initials(comment.user_display_name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{comment.user_display_name}</span>
          <span className="text-[10px] text-muted-foreground">{formatRelativeTime(comment.created_at)}</span>
        </div>
        <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{comment.content}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {!isReply && (
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-muted-foreground" onClick={() => setReplyTo(comment.id)}>
              <Reply className="h-2.5 w-2.5 mr-0.5" /> Reply
            </Button>
          )}
          {currentUserId === comment.user_id && (
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-destructive" onClick={() => onDeleteComment(comment.id)}>
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Comments ({itemComments.length})</span>
      </div>

      {itemComments.length > 0 && (
        <ScrollArea className="max-h-48">
          <div className="space-y-2 pr-2">
            {topLevel.map(comment => (
              <div key={comment.id}>
                {renderComment(comment)}
                {replies(comment.id).map(reply => renderComment(reply, true))}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="space-y-1">
        {replyTo && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Reply className="h-2.5 w-2.5" />
            <span>Replying to comment</span>
            <Button variant="ghost" size="sm" className="h-4 px-1 text-[10px]" onClick={() => setReplyTo(null)}>Cancel</Button>
          </div>
        )}
        <div className="flex gap-1.5">
          <Textarea
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[32px] h-8 text-xs resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
          />
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleSubmit} disabled={!newComment.trim() || isSubmitting}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
