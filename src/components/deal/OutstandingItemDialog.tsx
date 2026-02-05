import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, User, Send, Trash2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { OutstandingItem } from '@/hooks/useOutstandingItems';
import { useOutstandingItemComments } from '@/hooks/useOutstandingItemComments';
import { useAuth } from '@/contexts/AuthContext';

interface OutstandingItemDialogProps {
  item: OutstandingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
}

export function OutstandingItemDialog({
  item,
  open,
  onOpenChange,
  onUpdate,
}: OutstandingItemDialogProps) {
  const [newComment, setNewComment] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [etaValue, setEtaValue] = useState('');
  const { comments, isLoading, addComment, deleteComment } = useOutstandingItemComments(item?.id || null);
  const { user } = useAuth();

  // Sync local state when item changes
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && item) {
      setNotesValue(item.notes || '');
      setEtaValue(item.eta || '');
    }
    onOpenChange(isOpen);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment(newComment);
    setNewComment('');
  };

  const handleSaveNotes = () => {
    if (item) {
      onUpdate(item.id, { notes: notesValue });
      setEditingNotes(false);
    }
  };

  const handleSaveEta = () => {
    if (item) {
      onUpdate(item.id, { eta: etaValue || null });
    }
  };

  if (!item) return null;

  const requesters = Array.isArray(item.requestedBy) ? item.requestedBy : [item.requestedBy];
  const hasNoRequester = !item.requestedBy || requesters.length === 0 || (requesters.length === 1 && !requesters[0]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold pr-8">{item.text}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Item Status */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(item.createdAt), 'M/d/yy')}
            </div>
            <div className={cn(
              "flex items-center gap-1.5",
              hasNoRequester ? "text-destructive" : "text-muted-foreground"
            )}>
              <User className="h-3.5 w-3.5" />
              {hasNoRequester
                ? 'No requester assigned'
                : `by ${requesters.join(', ')}`}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant={item.received ? 'default' : 'outline'} className={cn(
                "text-xs",
                item.received && "bg-emerald-500 hover:bg-emerald-600"
              )}>
                Received
              </Badge>
              <Badge variant={item.approved ? 'default' : 'outline'} className={cn(
                "text-xs",
                item.approved && "bg-emerald-500 hover:bg-emerald-600"
              )}>
                Submitted
              </Badge>
            </div>
          </div>

          <Separator />

          {/* ETA Section */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              ETA:
            </div>
            <Input
              type="date"
              value={etaValue}
              onChange={(e) => setEtaValue(e.target.value)}
              onBlur={handleSaveEta}
              className="w-40 h-8 text-sm"
            />
            {etaValue && (
              <span className="text-sm text-muted-foreground">
                ({format(new Date(etaValue), 'MMM d, yyyy')})
              </span>
            )}
          </div>

          {/* Notes Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Notes</span>
              {!editingNotes && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setEditingNotes(true)}
                >
                  {item.notes ? 'Edit' : 'Add notes'}
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add notes about what's needed, status updates, etc."
                  className="min-h-[80px] text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNotes}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setNotesValue(item.notes || '');
                    setEditingNotes(false);
                  }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 min-h-[60px]">
                {item.notes || 'No notes yet'}
              </p>
            )}
          </div>

          <Separator />

          {/* Comments Section */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Comments ({comments.length})</span>
            </div>

            <ScrollArea className="flex-1 -mx-2 px-2 max-h-[200px]">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No comments yet</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="bg-muted/50 rounded-lg p-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-primary">
                              {comment.user_display_name || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                        {user?.id === comment.user_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => deleteComment(comment.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Add Comment Input */}
            <div className="flex gap-2 mt-3 pt-3 border-t">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleAddComment}
                disabled={!newComment.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
