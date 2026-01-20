import { useState, useRef, useEffect } from 'react';
import { Flag, Save, Clock, Trash2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useFlagNotes } from '@/hooks/useFlagNotes';
import { toast } from '@/hooks/use-toast';

interface FlagNoteDialogProps {
  dealId: string;
  dealName: string;
  isOpen: boolean;
  onClose: () => void;
  currentFlagNotes: string | null;
  isFlagged: boolean;
  onSave: (isFlagged: boolean, flagNotes: string) => Promise<void>;
}

export function FlagNoteDialog({
  dealId,
  dealName,
  isOpen,
  onClose,
  currentFlagNotes,
  isFlagged,
  onSave,
}: FlagNoteDialogProps) {
  const [localValue, setLocalValue] = useState(currentFlagNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { flagNotes: flagHistory, addFlagNote, deleteFlagNote } = useFlagNotes(dealId);

  useEffect(() => {
    if (isOpen) {
      setLocalValue(currentFlagNotes || '');
      // Auto-focus after dialog animation
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, currentFlagNotes]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Archive previous note to history if different
      if (currentFlagNotes && currentFlagNotes.trim() && localValue !== currentFlagNotes) {
        await addFlagNote(currentFlagNotes);
      }
      await onSave(true, localValue);
      toast({
        title: "Deal flagged",
        description: "Deal marked for discussion.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Failed to flag deal",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      const noteToArchive = localValue.trim();
      if (noteToArchive) {
        await addFlagNote(noteToArchive);
      }
      await onSave(false, '');
      toast({
        title: "Flag completed",
        description: "The flag has been marked as complete.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Failed to complete flag",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveFlag = async () => {
    setIsSaving(true);
    try {
      await onSave(false, '');
      toast({
        title: "Flag removed",
        description: "Flag has been removed from the deal.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Failed to remove flag",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Flag for Discussion
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Flagging <span className="font-medium text-foreground">{dealName}</span>
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Flag Notes</label>
              <div className="flex items-center gap-1">
                {flagHistory.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title="View flag history"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Flag History</p>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {flagHistory.map((item) => (
                            <div key={item.id} className="text-xs p-2 bg-muted/50 rounded group relative">
                              <p className="text-muted-foreground pr-5 break-words">{item.note}</p>
                              <p className="text-muted-foreground/70 mt-1">
                                {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                              <button
                                onClick={() => deleteFlagNote(item.id)}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {isFlagged && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1 h-6 text-xs px-2"
                      onClick={handleComplete}
                      disabled={isSaving}
                    >
                      <Check className="h-2.5 w-2.5" />
                      Complete
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={handleRemoveFlag}
                      disabled={isSaving}
                      title="Remove flag"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Textarea
              ref={textareaRef}
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Why is this deal flagged for discussion?"
              className="min-h-[100px] resize-none"
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {localValue.length}/500 · Press Enter to save
              </p>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-7 text-xs"
              >
                <Save className="h-3 w-3 mr-1" />
                {isFlagged ? 'Save' : 'Flag Deal'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
