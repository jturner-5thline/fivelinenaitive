import { useState } from 'react';
import { format } from 'date-fns';
import { History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface StatusNote {
  id: string;
  note: string;
  created_at: string;
}

interface StatusHistoryPopoverProps {
  statusNotes: StatusNote[];
  onDeleteNote: (noteId: string) => void;
}

export function StatusHistoryPopover({ statusNotes, onDeleteNote }: StatusHistoryPopoverProps) {
  const [open, setOpen] = useState(false);

  if (statusNotes.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h4 className="font-medium text-sm">Status History</h4>
          <p className="text-xs text-muted-foreground">{statusNotes.length} note{statusNotes.length !== 1 ? 's' : ''}</p>
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="p-2 space-y-2">
            {statusNotes.map((item) => (
              <div 
                key={item.id} 
                className="text-sm p-3 bg-muted/50 rounded-lg group relative"
              >
                <p className="text-muted-foreground pr-6 break-words whitespace-pre-wrap overflow-hidden text-xs">
                  {item.note.replace(/<[^>]*>/g, '')}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {format(new Date(item.created_at), 'MMM d, yyyy')} at {format(new Date(item.created_at), 'h:mm a')}
                </p>
                <button
                  onClick={() => onDeleteNote(item.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
