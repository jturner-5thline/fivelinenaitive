import { useMemo, useState } from 'react';
import { MessageSquare, Plus, Trash2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChatConversation } from '@/hooks/useChatPersistence';
import { format, isSameDay, isValid, parse, startOfDay, subDays } from 'date-fns';

interface Props {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/**
 * Try to interpret the query as a date. Supports:
 *  - "today", "yesterday"
 *  - ISO ("2025-04-23"), US ("4/23/2025", "4/23"), and "Apr 23" / "April 23"
 * Returns a Date (start of day) or null when not a date.
 */
function parseDateQuery(raw: string): Date | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  if (q === 'today') return startOfDay(new Date());
  if (q === 'yesterday') return startOfDay(subDays(new Date(), 1));

  const formats = [
    'yyyy-MM-dd', 'yyyy/MM/dd',
    'MM/dd/yyyy', 'M/d/yyyy', 'MM/dd', 'M/d',
    'MMM d', 'MMM d yyyy', 'MMMM d', 'MMMM d yyyy',
    'd MMM', 'd MMM yyyy',
  ];
  const ref = new Date();
  for (const fmt of formats) {
    const d = parse(raw.trim(), fmt, ref);
    if (isValid(d)) return startOfDay(d);
  }
  return null;
}

export function ChatHistorySidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return conversations;
    const dateQuery = parseDateQuery(q);
    const lower = q.toLowerCase();
    return conversations.filter(c => {
      const titleMatch = c.title?.toLowerCase().includes(lower);
      const updated = new Date(c.updated_at);
      const dateMatch = dateQuery ? isSameDay(updated, dateQuery) : false;
      const formattedMatch =
        format(updated, 'MMM d').toLowerCase().includes(lower) ||
        format(updated, 'yyyy-MM-dd').includes(lower);
      return titleMatch || dateMatch || formattedMatch;
    });
  }, [conversations, query]);

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-2 border-b space-y-2">
        <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={onNew}>
          <Plus className="h-3 w-3" /> New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keywords or date…"
            aria-label="Search chat history"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">No conversations yet</p>
          )}
          {conversations.length > 0 && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">No matches</p>
          )}
          {filtered.map(c => (
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
