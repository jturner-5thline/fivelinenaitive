import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Trash2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CellComment {
  id: string;
  text: string;
  author: string;
  timestamp: Date;
  replies?: CellComment[];
}

interface CellCommentPopoverProps {
  comments: CellComment[];
  onAdd: (text: string) => void;
  onDelete: (id: string) => void;
  children: React.ReactNode;
}

export function CellCommentPopover({ comments, onAdd, onDelete, children }: CellCommentPopoverProps) {
  const [newComment, setNewComment] = useState('');
  const [open, setOpen] = useState(false);

  const handleAdd = () => {
    if (!newComment.trim()) return;
    onAdd(newComment.trim());
    setNewComment('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <MessageSquare className="h-3.5 w-3.5" />
            Comments ({comments.length})
          </div>

          {comments.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="bg-muted rounded p-2 text-xs group relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{c.author}</span>
                    <span className="text-[10px] text-muted-foreground">{c.timestamp.toLocaleDateString()}</span>
                  </div>
                  <p className="text-muted-foreground">{c.text}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="text-xs min-h-[60px] resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd(); }}
            />
          </div>
          <Button size="sm" className="h-7 w-full text-xs gap-1" onClick={handleAdd} disabled={!newComment.trim()}>
            <Send className="h-3 w-3" /> Add Comment
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
