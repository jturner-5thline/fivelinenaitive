import { useState } from 'react';
import { format } from 'date-fns';
import { Clock, Loader2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MemoAuditEntry, getFieldLabel } from '@/hooks/useDealMemoAuditLog';

interface MemoAuditLogPopoverProps {
  entries: MemoAuditEntry[];
  isLoading: boolean;
  onRevert?: (entry: MemoAuditEntry) => void;
}

function DiffView({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  const oldLines = (oldValue || '').split('\n').filter(Boolean);
  const newLines = (newValue || '').split('\n').filter(Boolean);

  // Find removed and added lines
  const removed = oldLines.filter(l => !newLines.includes(l));
  const added = newLines.filter(l => !oldLines.includes(l));

  if (removed.length === 0 && added.length === 0) {
    // Content changed but lines are the same (e.g. whitespace) — show simple summary
    return (
      <p className="text-xs text-muted-foreground italic mt-1">Minor formatting change</p>
    );
  }

  return (
    <div className="mt-2 space-y-1 text-xs font-mono">
      {removed.map((line, i) => (
        <div key={`r-${i}`} className="bg-destructive/15 text-destructive rounded px-2 py-0.5 break-words">
          <span className="select-none mr-1">−</span>
          {line}
        </div>
      ))}
      {added.map((line, i) => (
        <div key={`a-${i}`} className="bg-primary/15 text-primary rounded px-2 py-0.5 break-words">
          <span className="select-none mr-1">+</span>
          {line}
        </div>
      ))}
    </div>
  );
}

function AuditEntryCard({ 
  entry, 
  onRevert 
}: { 
  entry: MemoAuditEntry; 
  onRevert?: (entry: MemoAuditEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-sm p-3 bg-muted/50 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs">
            {entry.user_display_name || 'Unknown'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Updated <span className="font-medium text-foreground">{getFieldLabel(entry.field_changed)}</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground/70 whitespace-nowrap text-right">
            {format(new Date(entry.created_at), 'MMM d, yyyy')}
            <br />
            {format(new Date(entry.created_at), 'h:mm a')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {expanded ? 'Hide' : 'View'} Changes
        </Button>
        {onRevert && entry.old_value !== null && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onRevert(entry)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Revert
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Revert this field to its previous value</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {expanded && (
        <DiffView oldValue={entry.old_value} newValue={entry.new_value} />
      )}
    </div>
  );
}

export function MemoAuditLogPopover({ entries, isLoading, onRevert }: MemoAuditLogPopoverProps) {
  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Clock className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Memo Change History</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-4 py-3 border-b">
          <h4 className="font-medium text-sm">Change History</h4>
          <p className="text-xs text-muted-foreground">
            {entries.length} change{entries.length !== 1 ? 's' : ''} recorded
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No changes recorded yet
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="p-2 space-y-2">
              {entries.map((entry) => (
                <AuditEntryCard
                  key={entry.id}
                  entry={entry}
                  onRevert={onRevert}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
