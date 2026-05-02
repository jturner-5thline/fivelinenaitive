import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type DocumentScope = 'all' | 'financial' | 'transcripts' | 'custom';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
}

export function useDealSpaceAI(dealId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [scope, setScope] = useState<DocumentScope>('all');
  const [includeDataRoom, setIncludeDataRoom] = useState<boolean>(true);

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

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const apiMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      const message = err instanceof Error ? err.message : 'Failed to get response';
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
    }
  }, [messages, dealId, scope, includeDataRoom]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    setMessages,
    scope,
    setScope,
    includeDataRoom,
    setIncludeDataRoom,
  };
}
