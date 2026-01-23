import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Agent } from './useAgents';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface DealContext {
  id?: string;
  company?: string;
  value?: number;
  stage?: string;
  status?: string;
}

export function useAgentChat(agent: Agent | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string, dealContext?: DealContext) => {
    if (!content.trim() || !agent) return;

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

      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: {
          messages: apiMessages,
          agentConfig: {
            id: agent.id,
            name: agent.name,
            system_prompt: agent.system_prompt,
            personality: agent.personality,
            temperature: agent.temperature,
            can_access_deals: agent.can_access_deals,
            can_access_lenders: agent.can_access_lenders,
            can_access_activities: agent.can_access_activities,
            can_access_milestones: agent.can_access_milestones,
            can_search_web: agent.can_search_web,
          },
          dealContext,
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
  }, [agent, messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
  };
}
