import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MessageSquare,
  Flag,
  Send,
  Loader2,
  Trash2,
  Filter,
  AlertTriangle,
} from 'lucide-react';
import {
  useLenderNotes,
  useLenderHasFlags,
  useAddLenderNote,
  useDeleteLenderNote,
  LENDER_NOTE_TAGS,
  type LenderNote,
} from '@/hooks/useLenderNotes';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface LenderNotesPopoverProps {
  lenderName: string;
  masterLenderId?: string | null;
  children?: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export function LenderNotesPopover({
  lenderName,
  masterLenderId,
  children,
  side = 'right',
  align = 'start',
}: LenderNotesPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || <LenderNotesIcon lenderName={lenderName} />}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[380px] p-0">
        <LenderNotesPanel
          lenderName={lenderName}
          masterLenderId={masterLenderId}
        />
      </PopoverContent>
    </Popover>
  );
}

// Small icon button that shows flag indicator
export function LenderNotesIcon({
  lenderName,
  className,
  showCount = false,
}: {
  lenderName: string;
  className?: string;
  showCount?: boolean;
}) {
  const { data: hasFlags } = useLenderHasFlags(lenderName);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 w-7 p-0 relative', className)}
          onClick={(e) => e.stopPropagation()}
        >
          {hasFlags ? (
            <Flag className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {hasFlags && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hasFlags ? 'Flagged – view internal notes' : 'Internal lender notes'}
      </TooltipContent>
    </Tooltip>
  );
}

// Flag indicator badge (non-interactive, for inline display)
export function LenderFlagIndicator({
  lenderName,
  className,
}: {
  lenderName: string;
  className?: string;
}) {
  const { data: hasFlags } = useLenderHasFlags(lenderName);

  if (!hasFlags) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex', className)}>
          <Flag className="h-3 w-3 text-amber-500" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Internal flag – view notes for details</TooltipContent>
    </Tooltip>
  );
}

// The main notes panel content
function LenderNotesPanel({
  lenderName,
  masterLenderId,
}: {
  lenderName: string;
  masterLenderId?: string | null;
}) {
  const { data: notes, isLoading } = useLenderNotes(lenderName);
  const addNote = useAddLenderNote();
  const deleteNote = useDeleteLenderNote();
  const { user } = useAuth();

  const [body, setBody] = useState('');
  const [isFlag, setIsFlag] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFlagsOnly, setShowFlagsOnly] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  const filteredNotes = showFlagsOnly
    ? (notes || []).filter((n) => n.is_flag)
    : notes || [];

  const handleSubmit = async () => {
    if (!body.trim()) return;
    await addNote.mutateAsync({
      lenderName,
      masterLenderId,
      body: body.trim(),
      isFlag,
      tags: selectedTags,
    });
    setBody('');
    setIsFlag(false);
    setSelectedTags([]);
    setShowComposer(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="flex flex-col max-h-[480px]">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold">Internal Notes</h4>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showFlagsOnly ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowFlagsOnly(!showFlagsOnly)}
                >
                  <Filter className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showFlagsOnly ? 'Show all notes' : 'Show flagged only'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          Internal only — not visible to lenders or borrowers
        </p>
      </div>

      {/* Notes list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-2 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center py-6">
              <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                {showFlagsOnly
                  ? 'No flagged notes'
                  : 'No notes yet for this funding source'}
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => (
              <NoteEntry
                key={note.id}
                note={note}
                canDelete={note.author_user_id === user?.id}
                onDelete={() =>
                  deleteNote.mutate({ noteId: note.id, lenderName })
                }
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Composer */}
      <div className="px-4 py-3">
        {showComposer ? (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add an internal note about this funding source..."
              rows={3}
              className="text-sm min-h-[60px] resize-none"
              autoFocus
            />

            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {LENDER_NOTE_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                  className="text-[10px] cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>

            {/* Flag toggle + submit */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={isFlag}
                  onCheckedChange={setIsFlag}
                  className="scale-75"
                />
                <Label className="text-xs font-normal flex items-center gap-1 cursor-pointer">
                  <Flag className="h-3 w-3 text-amber-500" />
                  Mark as flag
                </Label>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowComposer(false);
                    setBody('');
                    setSelectedTags([]);
                    setIsFlag(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleSubmit}
                  disabled={!body.trim() || addNote.isPending}
                >
                  {addNote.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Save
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">⌘+Enter to save</p>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5"
            onClick={() => setShowComposer(true)}
          >
            <MessageSquare className="h-3 w-3" />
            Add Note
          </Button>
        )}
      </div>
    </div>
  );
}

function NoteEntry({
  note,
  canDelete,
  onDelete,
}: {
  note: LenderNote;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group relative">
      <div className="flex items-start gap-2">
        <Avatar className="h-5 w-5 mt-0.5 shrink-0">
          <AvatarImage src={note.author_avatar_url || undefined} />
          <AvatarFallback className="text-[8px]">
            {(note.author_display_name || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium truncate">
              {note.author_display_name}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(note.created_at), {
                addSuffix: true,
              })}
            </span>
            {note.is_flag && (
              <Flag className="h-2.5 w-2.5 text-amber-500 shrink-0" />
            )}
          </div>
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {note.body}
          </p>
          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {note.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[9px] px-1.5 py-0"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
