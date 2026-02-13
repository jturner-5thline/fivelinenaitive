import { format } from 'date-fns';
import { Clock, Loader2 } from 'lucide-react';
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
}

export function MemoAuditLogPopover({ entries, isLoading }: MemoAuditLogPopoverProps) {
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
                <div
                  key={entry.id}
                  className="text-sm p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs">
                        {entry.user_display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Updated <span className="font-medium text-foreground">{getFieldLabel(entry.field_changed)}</span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground/70 whitespace-nowrap">
                      {format(new Date(entry.created_at), 'MMM d, yyyy')}
                      <br />
                      {format(new Date(entry.created_at), 'h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
