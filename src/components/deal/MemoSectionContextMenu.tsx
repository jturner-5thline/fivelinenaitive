import { type CSSProperties, type ReactNode, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MemoCommentThread } from './MemoCommentThread';
import { MemoComment } from '@/hooks/useDealMemoComments';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

interface MemoSectionContextMenuProps {
  children: ReactNode;
  section: string;
  sectionLabel: string;
  itemIndex?: number | null;
  comments: MemoComment[];
  commentCount: number;
  onAddComment: (content: string, mentionedUserIds?: string[]) => Promise<any>;
  onReply: (parentId: string, content: string, mentionedUserIds?: string[]) => Promise<any>;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function MemoSectionContextMenu({
  children,
  section,
  sectionLabel,
  itemIndex,
  comments,
  commentCount,
  onAddComment,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
  className,
  style,
}: MemoSectionContextMenuProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className={className ? `relative ${className}` : 'relative'} style={style}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => setPopoverOpen(true)}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Comment on {sectionLabel}
            {itemIndex !== null && itemIndex !== undefined && ` #${itemIndex + 1}`}
            {commentCount > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">({commentCount})</span>
            )}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      
      {/* Hidden popover anchor for context menu trigger */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal>
        <PopoverTrigger asChild>
          <span className="absolute top-0 right-0 w-0 h-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent
          className="w-[360px] p-0"
          align="end"
          side="left"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={() => setPopoverOpen(false)}
        >
          <MemoCommentThreadContent
            section={section}
            sectionLabel={sectionLabel}
            itemIndex={itemIndex}
            comments={comments}
            onAddComment={onAddComment}
            onReply={onReply}
            onResolve={onResolve}
            onUnresolve={onUnresolve}
            onDelete={onDelete}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Inline content version (no popover wrapper) for use inside MemoSectionContextMenu's popover
import { useState as useStateInline, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Send, Check, Trash2, Reply, X, AtSign } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

function MemoCommentThreadContent({
  section,
  sectionLabel,
  itemIndex,
  comments,
  onAddComment,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
}: {
  section: string;
  sectionLabel: string;
  itemIndex?: number | null;
  comments: MemoComment[];
  onAddComment: (content: string, mentionedUserIds?: string[]) => Promise<any>;
  onReply: (parentId: string, content: string, mentionedUserIds?: string[]) => Promise<any>;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useStateInline('');
  const [replyingTo, setReplyingTo] = useStateInline<string | null>(null);
  const [replyText, setReplyText] = useStateInline('');
  const [isSubmitting, setIsSubmitting] = useStateInline(false);
  const [teamMembers, setTeamMembers] = useStateInline<TeamMember[]>([]);
  const [showMentions, setShowMentions] = useStateInline(false);
  const [mentionFilter, setMentionFilter] = useStateInline('');
  const [activeTextarea, setActiveTextarea] = useStateInline<'new' | 'reply' | null>(null);
  const [cursorPosition, setCursorPosition] = useStateInline(0);
  const newCommentRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.rpc('get_team_members_for_mention', { _user_id: user.id }).then(({ data }) => {
      if (data) {
        setTeamMembers(data.map((d: any) => ({
          user_id: d.user_id,
          display_name: d.display_name || d.email,
          email: d.email,
        })));
      }
    });
  }, [user]);

  // Auto-focus on new comment input
  useEffect(() => {
    setTimeout(() => newCommentRef.current?.focus(), 100);
  }, []);

  const [mentionedIds, setMentionedIds] = useStateInline<string[]>([]);
  const [replyMentionedIds, setReplyMentionedIds] = useStateInline<string[]>([]);

  const handleTextChange = (value: string, type: 'new' | 'reply') => {
    if (type === 'new') setNewComment(value);
    else setReplyText(value);

    const ref = type === 'new' ? newCommentRef.current : replyRef.current;
    if (!ref) return;
    const pos = ref.selectionStart;
    setCursorPosition(pos);

    const textBeforeCursor = value.slice(0, pos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionFilter(textAfterAt.toLowerCase());
        setShowMentions(true);
        setActiveTextarea(type);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (member: TeamMember) => {
    const type = activeTextarea;
    const text = type === 'new' ? newComment : replyText;
    const ref = type === 'new' ? newCommentRef.current : replyRef.current;
    if (!ref) return;

    const textBeforeCursor = text.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const before = text.slice(0, atIndex);
    const after = text.slice(cursorPosition);
    const mentionDisplay = `@${member.display_name}`;
    const newVal = before + mentionDisplay + ' ' + after;

    if (type === 'new') {
      setNewComment(newVal);
      setMentionedIds(prev => prev.includes(member.user_id) ? prev : [...prev, member.user_id]);
    } else {
      setReplyText(newVal);
      setReplyMentionedIds(prev => prev.includes(member.user_id) ? prev : [...prev, member.user_id]);
    }
    setShowMentions(false);
    ref.focus();
  };

  const filteredMembers = teamMembers.filter(m =>
    m.display_name.toLowerCase().includes(mentionFilter) ||
    m.email.toLowerCase().includes(mentionFilter)
  );

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    setIsSubmitting(true);
    await onAddComment(newComment, mentionedIds);
    setNewComment('');
    setMentionedIds([]);
    setIsSubmitting(false);
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    setIsSubmitting(true);
    await onReply(parentId, replyText, replyMentionedIds);
    setReplyText('');
    setReplyMentionedIds([]);
    setReplyingTo(null);
    setIsSubmitting(false);
  };

  const renderContent = (content: string) => {
    return content.replace(/@\[([^\]]+)\]\([^)]+\)/g, (_, name) => `@${name}`);
  };

  const renderComment = (comment: MemoComment, isReplyComment = false) => (
    <div
      key={comment.id}
      className={cn(
        'group rounded-md p-2.5',
        isReplyComment ? 'ml-6 border-l-2 border-primary/20 pl-3' : '',
        comment.resolved ? 'opacity-60' : ''
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium">{comment.userDisplayName}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
            {comment.resolved && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-success/30 text-success">
                Resolved
              </Badge>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">
            {renderContent(comment.content).split(/(@\w[\w\s]*)/g).map((part, i) =>
              part.startsWith('@') ? (
                <span key={i} className="text-primary font-medium">{part}</span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {!isReplyComment && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setReplyingTo(comment.id); setReplyText(''); }}
            >
              <Reply className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => comment.resolved ? onUnresolve(comment.id) : onResolve(comment.id)}
          >
            <Check className={cn("h-3 w-3", comment.resolved && "text-success")} />
          </Button>
          {comment.userId === user?.id && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {comment.replies?.map(reply => renderComment(reply, true))}

      {replyingTo === comment.id && (
        <div className="ml-6 mt-2 space-y-1.5 relative">
          <div className="flex items-center gap-1 mb-1">
            <Reply className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Replying to {comment.userDisplayName}</span>
            <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => setReplyingTo(null)}>
              <X className="h-2.5 w-2.5" />
            </Button>
          </div>
          <Textarea
            ref={replyRef}
            value={replyText}
            onChange={(e) => handleTextChange(e.target.value, 'reply')}
            placeholder="Reply... use @ to mention"
            className="min-h-[50px] text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmitReply(comment.id);
              }
            }}
          />
          {showMentions && activeTextarea === 'reply' && filteredMembers.length > 0 && (
            <MentionDropdown members={filteredMembers} onSelect={insertMention} />
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => handleSubmitReply(comment.id)}
              disabled={!replyText.trim() || isSubmitting}
              className="h-7 text-xs"
            >
              <Send className="h-3 w-3 mr-1" /> Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="p-3 border-b">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comments on {sectionLabel}
          {itemIndex !== null && itemIndex !== undefined && (
            <span className="text-muted-foreground">#{itemIndex + 1}</span>
          )}
        </h4>
      </div>

      <ScrollArea className="max-h-[300px]">
        <div className="p-2 space-y-1">
          {comments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
          ) : (
            comments.map(c => renderComment(c))
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t space-y-2 relative">
        <Textarea
          ref={newCommentRef}
          value={newComment}
          onChange={(e) => handleTextChange(e.target.value, 'new')}
          placeholder="Add a comment... use @ to mention"
          className="min-h-[60px] text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmitComment();
            }
          }}
        />
        {showMentions && activeTextarea === 'new' && filteredMembers.length > 0 && (
          <MentionDropdown members={filteredMembers} onSelect={insertMention} />
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">⌘+Enter to send</span>
          <Button
            size="sm"
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || isSubmitting}
            className="h-7 text-xs"
          >
            <Send className="h-3 w-3 mr-1" /> Comment
          </Button>
        </div>
      </div>
    </>
  );
}

function MentionDropdown({ members, onSelect }: { members: TeamMember[]; onSelect: (m: TeamMember) => void }) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-50 bg-popover border rounded-md shadow-md max-h-[150px] overflow-y-auto mb-1">
      {members.slice(0, 8).map(m => (
        <button
          key={m.user_id}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
          onMouseDown={(e) => { e.preventDefault(); onSelect(m); }}
        >
          <AtSign className="h-3 w-3 text-primary shrink-0" />
          <span className="font-medium truncate">{m.display_name}</span>
          <span className="text-[10px] text-muted-foreground truncate">{m.email}</span>
        </button>
      ))}
    </div>
  );
}
