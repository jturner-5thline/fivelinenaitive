import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChatConversation } from '@/hooks/useChatPersistence';
import { format } from 'date-fns';

interface Props {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatHistorySidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-2 border-b">
        <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={onNew}>
          <Plus className="h-3 w-3" /> New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">No conversations yet</p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs group hover:bg-accent',
                activeId === c.id && 'bg-accent'
              )}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-[10px] text-muted-foreground">{format(new Date(c.updated_at), 'MMM d')}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
