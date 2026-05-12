import { useState, useRef, useEffect } from 'react';
import { Flag, Trash2, Check, Loader2, User, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFlagNotes, FlagNote } from '@/hooks/useFlagNotes';
import { useFlagAuthors } from '@/hooks/useFlagAuthors';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface FlagNoteDialogProps {
  dealId: string;
  dealName: string;
  isOpen: boolean;
  onClose: () => void;
  onFlagCountChange?: (count: number) => void;
}

export function FlagNoteDialog({
  dealId,
  dealName,
  isOpen,
  onClose,
  onFlagCountChange,
}: FlagNoteDialogProps) {
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeFlags, resolvedFlags, isLoading, addFlagNote, resolveFlagNote, deleteFlagNote, refetch } = useFlagNotes(dealId);
  const authorIds = [...activeFlags, ...resolvedFlags].map(f => f.user_id).filter(Boolean) as string[];
  const authors = useFlagAuthors(authorIds, isOpen);

  useEffect(() => {
    if (isOpen) {
      setNewNote('');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    // Don't emit while the initial fetch is still in flight — otherwise we
    // would clobber the seed count derived from `deal.isFlagged` and hide
    // the flag indicator on cards before the real count loads.
    if (isLoading) return;
    onFlagCountChange?.(activeFlags.length);
  }, [activeFlags.length, isLoading, onFlagCountChange]);

  const handleAddFlag = async () => {
    if (!newNote.trim()) return;
    setIsSaving(true);
    try {
      await addFlagNote(newNote);
      setNewNote('');
      toast({ title: "Flag added", description: "New flag added to this deal." });
    } catch {
      toast({ title: "Failed to add flag", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolve = async (noteId: string) => {
    try {
      await resolveFlagNote(noteId);
      toast({ title: "Flag resolved", description: "Flag marked as resolved." });
    } catch {
      toast({ title: "Failed to resolve flag", variant: "destructive" });
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await deleteFlagNote(noteId);
      toast({ title: "Flag removed" });
    } catch {
      toast({ title: "Failed to remove flag", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddFlag();
    }
  };

  const renderFlagItem = (flag: FlagNote, isResolved: boolean) => {
    const author = flag.user_id ? authors[flag.user_id] : null;
    return (
      <div key={flag.id} className={`p-3 rounded-lg border group ${isResolved ? 'bg-muted/30 border-border/50' : 'bg-muted/50 border-border'}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-sm break-words ${isResolved ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {flag.note}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {author && (
                <div className="flex items-center gap-1">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={author.avatarUrl || undefined} />
                    <AvatarFallback className="text-[7px]">
                      {author.displayName?.[0]?.toUpperCase() || <User className="h-2.5 w-2.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">{author.displayName}</span>
                </div>
              )}
              <span className="text-xs text-muted-foreground/60">
                {format(new Date(flag.created_at), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
          {!isResolved && (
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-primary"
                onClick={() => handleResolve(flag.id)}
                title="Resolve flag"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(flag.id)}
                title="Delete flag"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
          {isResolved && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => handleDelete(flag.id)}
              title="Delete flag"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Flags for Discussion
            {activeFlags.length > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                {activeFlags.length}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{dealName}</span>
          </p>

          {/* Add new flag */}
          <div className="space-y-2">
            <Textarea
              ref={textareaRef}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a new flag for discussion..."
              className="min-h-[80px] resize-none"
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {newNote.length}/500 · Enter to add
              </p>
              <Button
                size="sm"
                onClick={handleAddFlag}
                disabled={isSaving || !newNote.trim()}
                className="h-7 text-xs gap-1"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Add Flag
              </Button>
            </div>
          </div>

          {/* Active flags */}
          {activeFlags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Flags ({activeFlags.length})
              </p>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {activeFlags.map(flag => renderFlagItem(flag, false))}
              </div>
            </div>
          )}

          {/* Resolved flags */}
          {resolvedFlags.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowResolved(!showResolved)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                {showResolved ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Resolved ({resolvedFlags.length})
              </button>
              {showResolved && (
                <div className="space-y-2 max-h-[150px] overflow-y-auto">
                  {resolvedFlags.map(flag => renderFlagItem(flag, true))}
                </div>
              )}
            </div>
          )}

          {activeFlags.length === 0 && resolvedFlags.length === 0 && !newNote.trim() && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No flags yet. Add one above to flag this deal for discussion.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
