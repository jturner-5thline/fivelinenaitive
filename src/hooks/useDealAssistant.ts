import { useState, useCallback, useRef } from 'react';
import { sendClaudeMessage } from '@/services/claude';
import { toast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface DealContext {
  company: string;
  value: number;
  stage: string;
  status: string;
  manager?: string;
  lenders?: Array<{ name: string; stage: string; notes?: string }>;
  milestones?: Array<{ title: string; completed: boolean; dueDate?: string }>;
  activities?: Array<{ type: string; description: string; timestamp: string }>;
  notes?: string;
}

function buildDealSystemPrompt(ctx: DealContext): string {
  let s = `You are an AI assistant for deal management. You have access to the following deal information:\n\n`;
  s += `**Deal: ${ctx.company}**\n`;
  s += `- Value: $${(ctx.value / 1000000).toFixed(2)}M\n`;
  s += `- Stage: ${ctx.stage}\n`;
  s += `- Status: ${ctx.status}\n`;
  if (ctx.manager) s += `- Manager: ${ctx.manager}\n`;
  if (ctx.notes) s += `- Notes: ${ctx.notes}\n`;

  if (ctx.lenders?.length) {
    s += `\n**Lenders (${ctx.lenders.length}):**\n`;
    ctx.lenders.forEach(l => {
      s += `- ${l.name}: ${l.stage}${l.notes ? ` - ${l.notes}` : ''}\n`;
    });
  }

  if (ctx.milestones?.length) {
    s += `\n**Milestones:**\n`;
    ctx.milestones.forEach(m => {
      s += `- ${m.completed ? '✓' : '○'} ${m.title}${m.dueDate ? ` (Due: ${m.dueDate})` : ''}\n`;
    });
  }

  if (ctx.activities?.length) {
    s += `\n**Recent Activity:**\n`;
    ctx.activities.slice(0, 10).forEach(a => {
      s += `- ${a.timestamp}: ${a.description}\n`;
    });
  }

  s += `\n\nIMPORTANT FORMATTING RULES — follow these strictly:\n`;
  s += `- Always structure your responses with clear **headings** (##) for each section\n`;
  s += `- Use bullet points (•) for key items under each heading\n`;
  s += `- Use indented sub-bullets (  -) for supporting details under main bullets\n`;
  s += `- Keep each bullet concise — one key insight per line\n`;
  s += `- Use bold (**text**) to highlight critical terms, names, or numbers\n`;
  s += `- Format like an executive memo: scannable, hierarchical, and action-oriented\n`;
  s += `- Never write long paragraphs — break everything into structured bullet points\n`;
  s += `\nYou can help with:\n`;
  s += `- Summarizing deal status and progress\n`;
  s += `- Suggesting next steps or actions\n`;
  s += `- Analyzing lender engagement\n`;
  s += `- Identifying potential risks or blockers\n`;
  s += `- Checking for missing deal information or unchecked data room items\n`;
  s += `- Drafting communications or updates\n`;
  s += `\nLINKING RULES — when you identify missing or incomplete fields:\n`;
  s += `- Link to the relevant section using markdown links with these exact URLs:\n`;
  s += `  - Deal Info tab: [Go to Deal Info](#tab-deal-info)\n`;
  s += `  - Deal Write Up tab: [Go to Write Up](#tab-deal-writeup)\n`;
  s += `  - Data Room tab: [Go to Data Room](#tab-data-room)\n`;
  s += `  - Deal Space tab: [Go to Deal Space](#tab-deal-space)\n`;
  s += `  - Lenders tab: [Go to Lenders](#tab-lenders)\n`;
  s += `  - Deal Management tab: [Go to Deal Management](#tab-deal-management)\n`;
  s += `  - Deal Memo: [Open Deal Memo](#open-deal-memo)\n`;
  s += `- Place the link right after mentioning the missing field so the user can navigate directly\n`;
  s += `- Example: "• **Capital Ask** is not filled in — [Go to Write Up](#tab-deal-writeup)"\n`;

  return s;
}

export function useDealAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string, dealContext: DealContext) => {
    if (!content.trim()) return;

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
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const result = await sendClaudeMessage({
        messages: apiMessages,
        system: buildDealSystemPrompt(dealContext),
        context: 'deal-assistant' as any,
        temperature: 0.7,
        max_tokens: 1000,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to get response');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;

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
  }, [messages]);

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
