import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle2, Trash2, X, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Annotation } from '@/hooks/useModelAnnotations';
import { formatDistanceToNow } from 'date-fns';

interface AnnotationThreadProps {
  targetType: Annotation['target_type'];
  targetRef: string;
  targetLabel: string;
  annotations: Annotation[];
  onAdd: (targetType: Annotation['target_type'], targetRef: string, content: string, mentions?: string[]) => Promise<any>;
  onResolve: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  compact?: boolean;
}

export function AnnotationThread({
  targetType,
  targetRef,
  targetLabel,
  annotations,
  onAdd,
  onResolve,
  onDelete,
  compact = false,
}: AnnotationThreadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const unresolvedCount = annotations.filter(a => !a.resolved).length;

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Extract @mentions (simple pattern: @uuid or @name)
      const mentionMatches = newComment.match(/@[\w-]+/g) || [];
      await onAdd(targetType, targetRef, newComment.trim(), []);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative group inline-flex items-center justify-center transition-all",
            compact
              ? "h-5 w-5 rounded-sm hover:bg-muted"
              : "h-6 w-6 rounded hover:bg-muted/60"
          )}
          title={`${unresolvedCount} comment${unresolvedCount !== 1 ? 's' : ''} on ${targetLabel}`}
        >
          <MessageSquare className={cn(
            "transition-colors",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
            unresolvedCount > 0
              ? "text-primary fill-primary/20"
              : "text-muted-foreground/40 group-hover:text-muted-foreground"
          )} />
          {unresolvedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary text-[8px] text-primary-foreground flex items-center justify-center font-medium">
              {unresolvedCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        side="right"
        align="start"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium truncate max-w-[180px]">{targetLabel}</span>
            {unresolvedCount > 0 && (
              <Badge variant="secondary" className="h-4 text-[10px] px-1">
                {unresolvedCount}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIsOpen(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Thread */}
        <ScrollArea className="max-h-[240px]">
          {annotations.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-[11px] text-muted-foreground">No comments yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {annotations.map(a => (
                <div key={a.id} className={cn("px-3 py-2", a.resolved && "opacity-50")}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium truncate">
                          {a.user_name || 'User'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                        </span>
                        {a.resolved && (
                          <Badge variant="outline" className="h-3.5 text-[9px] px-1 text-emerald-500 border-emerald-500/30">
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
                        {a.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!a.resolved && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => onResolve(a.id)}
                          title="Resolve"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => onDelete(a.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border/50 p-2">
          <div className="flex gap-1.5">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment… (⌘+Enter to send)"
              className="min-h-[52px] max-h-[100px] text-xs resize-none border-border/50"
              rows={2}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 self-end"
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Floating annotation badge for charts/KPIs */
interface AnnotationBadgeProps {
  targetType: Annotation['target_type'];
  targetRef: string;
  targetLabel: string;
  annotations: Annotation[];
  onAdd: AnnotationThreadProps['onAdd'];
  onResolve: AnnotationThreadProps['onResolve'];
  onDelete: AnnotationThreadProps['onDelete'];
  className?: string;
}

export function AnnotationBadge({
  targetType,
  targetRef,
  targetLabel,
  annotations,
  onAdd,
  onResolve,
  onDelete,
  className,
}: AnnotationBadgeProps) {
  return (
    <div className={cn("absolute top-1 right-1 z-10", className)}>
      <AnnotationThread
        targetType={targetType}
        targetRef={targetRef}
        targetLabel={targetLabel}
        annotations={annotations}
        onAdd={onAdd}
        onResolve={onResolve}
        onDelete={onDelete}
      />
    </div>
  );
}
