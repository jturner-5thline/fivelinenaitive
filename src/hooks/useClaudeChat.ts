import { useState, useCallback, useRef, useMemo } from 'react';
import { sendClaudeMessage, SYSTEM_PROMPTS, ClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
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
      // Build conversation history for Claude
      const claudeMessages: ClaudeMessage[] = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const systemPrompt = systemOverride || SYSTEM_PROMPTS[context] || SYSTEM_PROMPTS.chat;

      const result = await sendClaudeMessage({
        messages: claudeMessages,
        system: systemPrompt,
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
