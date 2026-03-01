import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Send, CheckCircle, AtSign, Reply, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FPAComment {
  id: string;
  user_name: string;
  user_initials: string;
  content: string;
  mentions: string[];
  is_resolved: boolean;
  created_at: string;
  replies?: FPAComment[];
}

interface PLCommentThreadProps {
  targetKey: string;
  targetLabel: string;
  comments: FPAComment[];
  onAddComment: (targetKey: string, content: string, mentions: string[]) => void;
  onResolve: (commentId: string) => void;
}

// Simple @mention detection
const parseMentions = (text: string): string[] => {
  const matches = text.match(/@(\w+)/g);
  return matches ? matches.map(m => m.slice(1)) : [];
};

const renderContent = (content: string) => {
  return content.replace(/@(\w+)/g, (_, name) => `@${name}`);
};

export function PLCommentThread({ targetKey, targetLabel, comments, onAddComment, onResolve }: PLCommentThreadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');

  const unresolvedCount = comments.filter(c => !c.is_resolved).length;

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    const mentions = parseMentions(newComment);
    onAddComment(targetKey, newComment.trim(), mentions);
    setNewComment('');
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-0.5 p-0.5 rounded hover:bg-muted/50 transition-colors",
            unresolvedCount > 0 && "text-primary"
          )}
          title={`${unresolvedCount} comment(s) on ${targetLabel}`}
        >
          <MessageSquare className="h-3 w-3" />
          {unresolvedCount > 0 && (
            <span className="text-[9px] font-bold">{unresolvedCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{targetLabel}</span>
            <Badge variant="outline" className="text-[9px]">{comments.length} comments</Badge>
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto p-2 space-y-2">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
          )}
          {comments.map(comment => (
            <div key={comment.id} className={cn(
              "p-2 rounded-md border border-border/30 space-y-1",
              comment.is_resolved && "opacity-50"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px]">{comment.user_initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] font-medium">{comment.user_name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {!comment.is_resolved && (
                    <button
                      onClick={() => onResolve(comment.id)}
                      className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-success"
                      title="Resolve"
                    >
                      <CheckCircle className="h-3 w-3" />
                    </button>
                  )}
                  <span className="text-[9px] text-muted-foreground">{comment.created_at}</span>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed">
                {comment.content.split(/(@\w+)/g).map((part, i) =>
                  part.startsWith('@') ? (
                    <span key={i} className="text-primary font-medium">{part}</span>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
              {comment.is_resolved && (
                <Badge variant="outline" className="text-[8px] text-success border-success/30">Resolved</Badge>
              )}
            </div>
          ))}
        </div>

        <Separator />

        <div className="p-2 space-y-2">
          <Textarea
            placeholder="Add a comment… Use @ to mention"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            className="min-h-[60px] text-xs resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <AtSign className="h-2.5 w-2.5" /> ⌘+Enter to send
            </span>
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={handleSubmit} disabled={!newComment.trim()}>
              <Send className="h-2.5 w-2.5" /> Send
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
