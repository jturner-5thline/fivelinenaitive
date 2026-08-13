import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logUsage } from '@/lib/usageLogger';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoEmail } from '@/lib/demoLenderContact';
import { matchDemoDealCannedAnswer, matchDemoDealBulletAnswers } from '@/lib/demoDealCannedAnswers';
import { streamEdgeChat } from '@/lib/ai/streamEdgeChat';

export type DocumentScope = 'all' | 'financial' | 'transcripts' | 'custom';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
}

/** Max messages kept in the persisted transcript per deal. */
const PERSIST_LIMIT = 40;

const persistStorageKey = (persistKey: string, dealId: string) =>
  `naitive:deal-ai-chat:${persistKey}:${dealId}`;

function loadPersisted(persistKey: string | undefined, dealId: string | undefined): Message[] {
  if (!persistKey || !dealId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(persistStorageKey(persistKey, dealId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

export function useDealSpaceAI(
  dealId: string | undefined,
  options?: {
    /**
     * When set, the transcript is persisted per deal in localStorage under this
     * key so the back-and-forth survives collapsing/reopening the surface.
     */
    persistKey?: string;
  },
) {
  const persistKey = options?.persistKey;
  const [messages, setMessages] = useState<Message[]>(() => loadPersisted(persistKey, dealId));
  const [isLoading, setIsLoading] = useState(false);
  /** True once the first streamed token has arrived for the in-flight answer. */
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [scope, setScope] = useState<DocumentScope>('all');
  const [includeDataRoom, setIncludeDataRoom] = useState<boolean>(true);
  const { user } = useAuth();

  // Re-hydrate when the deal changes so transcripts never bleed across deals.
  useEffect(() => {
    if (!persistKey) return;
    setMessages(loadPersisted(persistKey, dealId));
    setError(null);
  }, [persistKey, dealId]);

  // Persist the transcript (trimmed) whenever it changes.
  useEffect(() => {
    if (!persistKey || !dealId || typeof window === 'undefined') return;
    try {
      const key = persistStorageKey(persistKey, dealId);
      if (messages.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(messages.slice(-PERSIST_LIMIT)));
    } catch {
      /* storage full or unavailable — chat still works in-memory */
    }
  }, [messages, persistKey, dealId]);

  const sendMessage = useCallback(async (
    content: string,
    overrideScope?: DocumentScope,
    options?: { conversationId?: string | null },
  ) => {
    if (!content.trim() || !dealId) return;

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    // Demo-only deterministic intercept: when demo@5thline.co is inside any
    // deal workspace and asks one of the mapped questions, return the exact
    // canned answer with no AI call. Scoped strictly to demo@5thline.co.
    if (isDemoEmail(user?.email)) {
      const bulleted = matchDemoDealBulletAnswers(content);
      const canned = bulleted ?? matchDemoDealCannedAnswer(content);
      if (canned) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: canned,
          timestamp: new Date(),
        }]);
        setIsLoading(false);
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const apiMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      // ── Streaming (SSE) path ──
      let streamed = '';
      let streamSources: string[] | undefined;
      let placeholderAdded = false;
      const appendDelta = (text: string) => {
        streamed += text;
        setIsStreaming(true);
        setMessages(prev => {
          if (!placeholderAdded) {
            placeholderAdded = true;
            return [...prev, { role: 'assistant' as const, content: streamed, timestamp: new Date() }];
          }
          return prev.map((m, i) =>
            i === prev.length - 1 && m.role === 'assistant' ? { ...m, content: streamed } : m,
          );
        });
      };

      try {
        await streamEdgeChat({
          functionName: 'deal-space-ai',
          body: {
            messages: apiMessages,
            dealId,
            scope: overrideScope || scope,
            includeDataRoom,
            conversationId: options?.conversationId ?? null,
          },
          signal: abortControllerRef.current.signal,
          onDelta: appendDelta,
          onSources: (s) => { streamSources = s; },
        });

        if (streamed.trim()) {
          if (streamSources?.length) {
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1 && m.role === 'assistant' ? { ...m, sources: streamSources } : m,
            ));
          }
          logUsage({
            feature_type: 'DEAL_SPACE_AI_LOOKUP',
            deal_id: dealId,
            metadata: { scope: overrideScope || scope, includeDataRoom, streamed: true },
          });
          return;
        }
      } catch (streamErr) {
        if (streamErr instanceof Error && streamErr.name === 'AbortError') return;
        console.warn('[deal-space-ai] streaming failed, falling back to buffered response', streamErr);
        if (placeholderAdded) setMessages(prev => prev.slice(0, -1));
        setIsStreaming(false);
      }

      // ── Buffered fallback ──
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { 
          messages: apiMessages,
          dealId,
          scope: overrideScope || scope,
          includeDataRoom,
          conversationId: options?.conversationId ?? null,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to get response');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        sources: data.sources,
      };

      setMessages(prev => [...prev, assistantMessage]);
      logUsage({
        feature_type: 'DEAL_SPACE_AI_LOOKUP',
        deal_id: dealId,
        metadata: { scope: overrideScope || scope, includeDataRoom },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      const message = err instanceof Error ? err.message : 'Failed to get response';
      setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [messages, dealId, scope, includeDataRoom]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    if (persistKey && dealId && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(persistStorageKey(persistKey, dealId));
      } catch { /* ignore */ }
    }
  }, [persistKey, dealId]);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    isStreaming,
    error,
    setMessages,
    scope,
    setScope,
    includeDataRoom,
    setIncludeDataRoom,
  };
}
