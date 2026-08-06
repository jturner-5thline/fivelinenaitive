import { useEffect, useRef, useState } from 'react';
import { SearchableRequesterList } from '@/components/deal/SearchableRequesterList';
import { format, isPast, isToday } from 'date-fns';
import { Calendar, User, Send, Trash2, Clock, Pencil, Check, X, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, ArrowUp, ArrowUpRight, UserPlus } from 'lucide-react';

// Parse YYYY-MM-DD as local date to avoid timezone shift
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NaitiveDatePicker } from '@/components/ui/naitive-date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { OutstandingItem, ItemPriority } from '@/hooks/useOutstandingItems';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOutstandingItemComments } from '@/hooks/useOutstandingItemComments';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { parseDateFromText, formatDateForInput } from '@/lib/parseDateFromText';
import { MentionTextarea, MentionText } from '@/components/tasks/MentionTextarea';
import { supabase } from '@/integrations/supabase/client';

function hasMentions(text: string): boolean {
  return /@\[[^\]]+\]\([0-9a-fA-F-]{36}\)/.test(text);
}

const PRIORITY_CONFIG: Record<ItemPriority, { label: string; dotColor: string }> = {
  urgent: { label: 'Urgent', dotColor: 'bg-destructive' },
  high: { label: 'High', dotColor: 'bg-orange-500' },
  normal: { label: 'Normal', dotColor: 'bg-muted-foreground' },
};

interface OutstandingItemDialogProps {
  item: OutstandingItem | null;
  items: OutstandingItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
  onSelectItem: (item: OutstandingItem) => void;
  lenderNames?: string[];
  companyName?: string;
  teamMembers?: { id: string; display_name: string }[];
}

export function OutstandingItemDialog({
  item,
  items,
  open,
  onOpenChange,
  onUpdate,
  onSelectItem,
  lenderNames = [],
  companyName,
  teamMembers = [],
}: OutstandingItemDialogProps) {
  const [newComment, setNewComment] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [etaValue, setEtaValue] = useState('');
  const [editingText, setEditingText] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [editingRequester, setEditingRequester] = useState(false);
  const [requesterValue, setRequesterValue] = useState<string[]>([]);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const { comments, isLoading, addComment, deleteComment } = useOutstandingItemComments(item?.id || null);
  const { user } = useAuth();

  // Build requester options
  const requestedByOptions = [
    ...(companyName ? [companyName] : []),
    ...lenderNames,
  ];

  // Sync local state when item changes
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && item) {
      setNotesValue(item.notes || '');
      setEtaValue(item.eta || '');
      setTextValue(item.text);
      setRequesterValue(Array.isArray(item.requestedBy) ? [...item.requestedBy] : item.requestedBy ? [item.requestedBy] : []);
      setEditingText(false);
      setEditingRequester(false);
      setEditingNotes(false);
    }
    onOpenChange(isOpen);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !item) return;
    const body = newComment;
    
    // Check for date references in the comment
    const parsedDate = parseDateFromText(newComment);
    if (parsedDate) {
      const formattedDate = formatDateForInput(parsedDate);
      const displayDate = format(parsedDate, 'MMM d, yyyy');
      
      // Update the ETA
      setEtaValue(formattedDate);
      onUpdate(item.id, { eta: formattedDate });
      
      // Show toast notification
      toast({
        title: 'ETA Updated',
        description: `ETA automatically set to ${displayDate} based on your comment.`,
        className: 'bg-primary text-primary-foreground',
      });
    }
    
    await addComment(newComment);
    setNewComment('');
    void notifyMentions(item.id, body, 'comment');
  };

  const notifyMentions = async (itemId: string, body: string, source: 'comment' | 'notes') => {
    if (!hasMentions(body)) return;
    try {
      const { data, error } = await supabase.functions.invoke('notify-outstanding-item-mention', {
        body: { item_id: itemId, source, body },
      });
      if (error) throw error;
      if ((data as any)?.sent > 0) {
        toast({
          title: 'Teammates notified',
          description: `Sent ${(data as any).sent} mention notification${(data as any).sent === 1 ? '' : 's'}.`,
        });
      }
    } catch (e) {
      console.warn('[outstanding-item-mention] notify failed', e);
    }
  };

  const handleSaveNotes = () => {
    if (item) {
      onUpdate(item.id, { notes: notesValue });
      setEditingNotes(false);
      void notifyMentions(item.id, notesValue, 'notes');
    }
  };

  const handleSaveEta = () => {
    if (item) {
      onUpdate(item.id, { eta: etaValue || null });
    }
  };

  const handleSaveText = () => {
    if (item && textValue.trim()) {
      onUpdate(item.id, { text: textValue.trim() });
      setEditingText(false);
    }
  };

  const handleSaveRequester = () => {
    if (item) {
      onUpdate(item.id, { requestedBy: requesterValue });
      setEditingRequester(false);
    }
  };

  const toggleRequester = (option: string) => {
    setRequesterValue(prev => 
      prev.includes(option) 
        ? prev.filter(o => o !== option)
        : [...prev, option]
    );
  };

  if (!item) return null;

  const currentIndex = items.findIndex(i => i.id === item.id);

  const goToPrev = () => {
    if (items.length <= 1) return;
    const prevIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
    onSelectItem(items[prevIndex]);
  };

  const goToNext = () => {
    if (items.length <= 1) return;
    const nextIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1;
    onSelectItem(items[nextIndex]);
  };

  const requesters = Array.isArray(item.requestedBy) ? item.requestedBy : [item.requestedBy];
  const hasNoRequester = !item.requestedBy || requesters.length === 0 || (requesters.length === 1 && !requesters[0]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent ref={dialogContentRef} className="max-w-xl max-h-[85vh] flex flex-col">
        {/* Navigation arrows */}
        {items.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 hover:bg-accent"
              onClick={goToPrev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 hover:bg-accent"
              onClick={goToNext}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
        <DialogHeader>
          {editingText ? (
            <div className="flex items-center gap-2 pr-8">
              <Input
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                className="flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveText();
                  if (e.key === 'Escape') {
                    setTextValue(item.text);
                    setEditingText(false);
                  }
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveText}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                setTextValue(item.text);
                setEditingText(false);
              }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <DialogTitle className="text-lg font-semibold pr-2">{item.text}</DialogTitle>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setEditingText(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Item Status */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(item.createdAt), 'M/d/yy')}
            </div>
            
            {/* Editable Requester */}
            {editingRequester ? (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-7 justify-between gap-2 font-normal text-xs',
                        requesterValue.length > 0 ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5'
                      )}
                    >
                      <span className="truncate">
                        {requesterValue.length === 0 
                          ? 'Select requester' 
                          : requesterValue.length === 1 
                            ? requesterValue[0] 
                            : `${requesterValue.length} selected`}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent container={dialogContentRef.current} className="pointer-events-auto z-[100] w-[220px] p-0 bg-popover" align="start">
                    <SearchableRequesterList
                      options={requestedByOptions}
                      selected={requesterValue}
                      onToggle={toggleRequester}
                    />
                  </PopoverContent>
                </Popover>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveRequester}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                  setRequesterValue(Array.isArray(item.requestedBy) ? [...item.requestedBy] : item.requestedBy ? [item.requestedBy] : []);
                  setEditingRequester(false);
                }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div 
                className={cn(
                  "flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors group",
                  hasNoRequester ? "text-destructive" : "text-muted-foreground"
                )}
                onClick={() => setEditingRequester(true)}
              >
                <User className="h-3.5 w-3.5" />
                {hasNoRequester
                  ? 'No requester assigned'
                  : `by ${requesters.join(', ')}`}
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            
            <div className="flex items-center gap-2 ml-auto">
              <Badge 
                variant={item.received ? 'default' : 'outline'} 
                className={cn(
                  "text-xs cursor-pointer transition-colors",
                  item.received && "bg-emerald-500 hover:bg-emerald-600",
                  !item.received && "hover:bg-accent"
                )}
                onClick={() => onUpdate(item.id, { received: !item.received })}
              >
                Received
              </Badge>
              <Badge 
                variant={item.approved ? 'default' : 'outline'} 
                className={cn(
                  "text-xs cursor-pointer transition-colors",
                  item.approved && "bg-emerald-500 hover:bg-emerald-600",
                  !item.approved && "hover:bg-accent"
                )}
                onClick={() => onUpdate(item.id, { approved: !item.approved })}
              >
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
            <NaitiveDatePicker
              value={etaValue || null}
              onChange={(next) => {
                setEtaValue(next || '');
                onUpdate(item.id, { eta: next || null });
              }}
              size="sm"
              placeholder="Pick ETA"
            />
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Priority:</span>
            <Button
              variant={item.priority === 'urgent' ? 'destructive' : 'outline'}
              size="sm"
              className="h-8 text-sm gap-1.5"
              onClick={() => onUpdate(item.id, { priority: item.priority === 'urgent' ? 'normal' : 'urgent' })}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {item.priority === 'urgent' ? 'Priority' : 'Mark as Priority'}
            </Button>
          </div>

          {/* ETA overdue warning */}
          {etaValue && isPast(parseLocalDate(etaValue)) && !isToday(parseLocalDate(etaValue)) && !(item.received && item.approved) && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              This item is overdue
            </div>
          )}


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
                <MentionTextarea
                  value={notesValue}
                  onChange={setNotesValue}
                  placeholder="Add notes… use @ to mention a teammate"
                  className="min-h-[80px] text-sm"
                  minRows={4}
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
                {item.notes ? <MentionText text={item.notes} /> : 'No notes yet'}
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
                          <p className="text-sm"><MentionText text={comment.content} /></p>
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
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <MentionTextarea
                value={newComment}
                onChange={setNewComment}
                onSubmit={handleAddComment}
                minRows={2}
                placeholder="Add a comment… use @ to mention a teammate"
                className="text-sm"
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
