import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { History, Trash2 } from 'lucide-react';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { supabase } from '@/integrations/supabase/client';
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
  user_id?: string | null;
}

interface StatusHistoryPopoverProps {
  statusNotes: StatusNote[];
  onDeleteNote: (noteId: string) => void;
  className?: string;
}

export function StatusHistoryPopover({ statusNotes, onDeleteNote, className }: StatusHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const ids = Array.from(new Set(statusNotes.map(n => n.user_id).filter(Boolean))) as string[];
    const missing = ids.filter(id => !names[id]);
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', missing);
      if (!data) return;
      setNames(prev => {
        const next = { ...prev };
        for (const p of data as any[]) next[p.id] = p.full_name || p.email || 'Unknown';
        return next;
      });
    })();
  }, [open, statusNotes, names]);

  if (statusNotes.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Status history"
          aria-label="Status history"
          className={className ?? 'h-6 w-6 text-muted-foreground hover:text-foreground'}
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-80 p-0 z-[1300] bg-popover"
      >
        <div className="px-4 py-3 border-b">
          <h4 className="font-medium text-sm">Status History</h4>
          <p className="text-xs text-muted-foreground">{statusNotes.length} previous status{statusNotes.length !== 1 ? 'es' : ''}</p>
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="p-2 space-y-2">
            {statusNotes.map((item) => (
              <div 
                key={item.id} 
                className="text-sm p-3 bg-muted/50 rounded-lg group relative"
              >
                <p className="text-muted-foreground pr-6 break-words whitespace-pre-wrap overflow-hidden text-xs">
                  {htmlToPlainText(item.note)}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {item.user_id ? `${names[item.user_id] || 'Loading…'} · ` : ''}
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
