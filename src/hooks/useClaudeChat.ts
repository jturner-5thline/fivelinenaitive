import { useState, useCallback, useRef, useMemo } from 'react';
import { sendClaudeMessage, SYSTEM_PROMPTS, ClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
import { prepareHistoryForClaude, type HistoryBudgetKey } from '@/lib/claude/historyCompaction';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Hook for Claude-powered naitive AI chat.
 * Maintains conversation history and sends through the secure Claude edge function.
 */
export function useClaudeChat(context: 'chat' | 'financial-analysis' | 'agent' | 'workflow' = 'chat') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(false);
  // Stable per-instance panel key: identifies this chat surface to the
  // request manager so stale (superseded) responses can be dropped.
  const panelKey = useMemo(() => `claude-chat:${context}:${crypto.randomUUID()}`, [context]);

  const sendMessage = useCallback(async (content: string, systemOverride?: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    abortRef.current = false;

    try {
      // Compact + trim + hard-cap history so long threads don't balloon the
      // prompt. The budget scales per context (financial-analysis is tighter
      // than free-form chat).
      const rawHistory: ClaudeMessage[] = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const budgetKey: HistoryBudgetKey =
        context === 'financial-analysis'
          ? 'financial_analysis'
          : context === 'agent'
            ? 'agent'
            : context === 'workflow'
              ? 'workflow'
              : 'chat';
      const prepared = prepareHistoryForClaude(rawHistory, budgetKey);
      console.log(
        `[claude-chat:${context}] history in=${prepared.stats.inputTurns} turns/` +
          `${prepared.stats.inputChars} chars → out=${prepared.stats.outputTurns} turns/` +
          `${prepared.stats.outputChars} chars ` +
          `(compacted=${prepared.stats.compactedTurns}, dropped=${prepared.stats.droppedByCap})`,
      );

      const systemPrompt = systemOverride || SYSTEM_PROMPTS[context] || SYSTEM_PROMPTS.chat;

      const result = await sendClaudeMessage({
        messages: prepared.messages,
        // Treat the system prompt as stable/static so prompt caching kicks in.
        staticSystem: systemPrompt,
        context,
        requestManager: { panelKey },
      });

      if (abortRef.current) return;

      // A newer send() for this panel superseded us — drop silently.
      if (isStaleClaudeResponse(result)) return;

      if (!result.success) {
        throw new Error(result.error || 'AI request failed');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      if (abortRef.current) return;

      const message = err instanceof Error ? err.message : 'Failed to get response';
      toast.error(message);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, context, panelKey]);

  const clearMessages = useCallback(() => {
    abortRef.current = true;
    setMessages([]);
    setIsLoading(false);
  }, []);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    setMessages,
  };
}
