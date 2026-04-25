import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Plus, Trash2, Search, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChatConversation } from '@/hooks/useChatPersistence';
import { format, isSameDay, isValid, parse, startOfDay, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Escape a string for use inside a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render `text` with all case-insensitive occurrences of `query` wrapped in
 * a highlighted <mark>. Returns the original string when query is empty.
 */
function highlight(text: string | undefined | null, query: string) {
  if (!text) return text ?? '';
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(`(${escapeRegExp(q)})`, 'ig');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) && part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={i}
        className="bg-primary/20 text-foreground rounded-[2px] px-0.5 py-0"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Build a short snippet around the first match in `text`. Pads with ellipses
 * on either side. Returns null if no match.
 */
function buildSnippet(text: string, query: string, radius = 40): string | null {
  if (!text || !query) return null;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

export function ChatHistorySidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  const [query, setQuery] = useState('');
  // Conversation IDs whose messages contain the current keyword query.
  // `null` means "no message search active" (empty query or pure date query).
  const [messageMatchIds, setMessageMatchIds] = useState<Set<string> | null>(null);
  const [searchingMessages, setSearchingMessages] = useState(false);
  // First matching message snippet per conversation, keyed by conversation_id.
  const [messageSnippets, setMessageSnippets] = useState<Record<string, string>>({});

  /**
   * LRU cache of message-content searches keyed by the normalized query.
   * Lets us reuse results instantly when the user re-types, backspaces,
   * clears + re-enters, or otherwise lands on a query we've already run
   * during this session — no round-trip needed.
   *
   * Capped at MAX_ENTRIES; eldest entries are evicted on overflow.
   * Entries also have a soft TTL so stale data doesn't linger forever.
   */
  type CachedSearch = {
    ids: Set<string>;
    snippets: Record<string, string>;
    cachedAt: number;
  };
  const MAX_CACHE_ENTRIES = 50;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
  const cacheRef = useRef<Map<string, CachedSearch>>(new Map());

  const normalizeQuery = (raw: string) => raw.trim().toLowerCase();

  const readCache = (key: string): CachedSearch | null => {
    const cache = cacheRef.current;
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    // Refresh LRU position
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  };

  const writeCache = (key: string, value: Omit<CachedSearch, 'cachedAt'>) => {
    const cache = cacheRef.current;
    cache.set(key, { ...value, cachedAt: Date.now() });
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  // Debounced server-side search across chat_messages.content.
  // Skip very short queries and pure date queries to avoid noisy results.
  useEffect(() => {
    const raw = query.trim();
    if (!raw || raw.length < 2 || parseDateQuery(raw)) {
      setMessageMatchIds(null);
      setSearchingMessages(false);
      setMessageSnippets({});
      return;
    }

    // Cache hit — apply synchronously, no debounce, no network.
    const cacheKey = normalizeQuery(raw);
    const cached = readCache(cacheKey);
    if (cached) {
      setMessageMatchIds(cached.ids);
      setMessageSnippets(cached.snippets);
      setSearchingMessages(false);
      return;
    }

    let cancelled = false;
    setSearchingMessages(true);
    const timer = window.setTimeout(async () => {
      // Escape PostgREST `ilike` wildcards so user-typed % and _ are literal.
      const escaped = raw.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('conversation_id, content, created_at')
        .ilike('content', `%${escaped}%`)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        const empty = new Set<string>();
        setMessageMatchIds(empty);
        setMessageSnippets({});
        // Cache the empty result too so we don't re-hit the network for
        // the same failing query within the TTL.
        writeCache(cacheKey, { ids: empty, snippets: {} });
      } else {
        const ids = new Set<string>();
        const snippets: Record<string, string> = {};
        for (const row of (data ?? []) as Array<{ conversation_id: string; content: string }>) {
          ids.add(row.conversation_id);
          // Keep the first (most recent) matching snippet per conversation.
          if (!snippets[row.conversation_id]) {
            const s = buildSnippet(row.content || '', raw);
            if (s) snippets[row.conversation_id] = s;
          }
        }
        setMessageMatchIds(ids);
        setMessageSnippets(snippets);
        writeCache(cacheKey, { ids, snippets });
      }
      setSearchingMessages(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setSearchingMessages(false);
    };
    // We deliberately depend only on `query` — cache helpers are refs and
    // don't trigger re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
      const messageMatch = messageMatchIds?.has(c.id) ?? false;
      return titleMatch || dateMatch || formattedMatch || messageMatch;
    });
  }, [conversations, query, messageMatchIds]);

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
          {query && !searchingMessages && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {searchingMessages && (
            <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground animate-spin" />
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">No conversations yet</p>
          )}
          {conversations.length > 0 && filtered.length === 0 && !searchingMessages && (
            <p className="text-xs text-muted-foreground p-2 text-center">No matches</p>
          )}
          {filtered.map(c => (
            <div
              key={c.id}
              className={cn(
                'flex items-start gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs group hover:bg-accent',
                activeId === c.id && 'bg-accent'
              )}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {highlight(c.title || 'Untitled', query)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {highlight(format(new Date(c.updated_at), 'MMM d'), query)}
                </p>
                {messageSnippets[c.id] && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                    {highlight(messageSnippets[c.id], query)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
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
