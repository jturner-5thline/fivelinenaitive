import { useState, useCallback, useRef, useMemo } from 'react';
import { sendClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
import { executeDealOperation, matchStageOrStatus, VALID_DEAL_STAGES, VALID_DEAL_STATUSES, VALID_LENDER_STAGES } from '@/services/dealOperations';
import { toast } from '@/hooks/use-toast';

export interface DealAction {
  id: string;
  type: 'update_deal_stage' | 'update_deal_status' | 'update_deal_notes' | 'add_lender' | 'remove_lender' | 'update_lender_stage' | 'add_outstanding_item' | 'mark_outstanding_complete';
  label: string;
  description: string;
  params: Record<string, unknown>;
  currentValue?: string;
  newValue?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: DealAction[];
  actionStatus?: 'pending' | 'confirmed' | 'cancelled';
  sources?: string[];
}

interface DealContext {
  id?: string;
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

const DEAL_ASSISTANT_SYSTEM_PROMPT = `You are an AI deal operations assistant for the naitive platform. You can both answer questions AND perform real operations on deals.

## Available Operations
When the user asks you to DO something (change, update, add, remove, move, set, mark), you MUST respond with a structured JSON action block. When they ask questions, answer normally.

### Action Format
When an action is needed, include EXACTLY ONE json block in your response like this:

\`\`\`action
{
  "type": "ACTION_TYPE",
  "params": { ... },
  "label": "Human-readable action label",
  "description": "What this will do",
  "currentValue": "current value if applicable",
  "newValue": "proposed new value"
}
\`\`\`

### Action Types:
1. **update_deal_stage** - params: { deal_id, new_stage }
2. **update_deal_status** - params: { deal_id, new_status }
3. **update_deal_notes** - params: { deal_id, note_text }
4. **add_lender** - params: { deal_id, lender_name }
5. **remove_lender** - params: { deal_id, lender_name }
6. **update_lender_stage** - params: { deal_id, lender_name, new_stage }
7. **add_outstanding_item** - params: { deal_id, title, description }
8. **mark_outstanding_complete** - params: { item_id, deal_id }

### Valid Deal Stages:
${VALID_DEAL_STAGES.map(s => `- "${s.id}" = ${s.label}`).join('\n')}

### Valid Deal Statuses:
${VALID_DEAL_STATUSES.map(s => `- "${s.id}" = ${s.label}`).join('\n')}

### Valid Lender Stages:
${VALID_LENDER_STAGES.map(s => `- "${s.id}" = ${s.label}`).join('\n')}

## Rules
- ALWAYS use the exact stage/status IDs (slugified) in action params, not display labels
- Before any mutation, briefly confirm what you're about to do in natural language, then include the action block
- If the user references "this deal" or "the deal", use the current deal context provided
- For deal lookups, use the deal info already in context rather than asking the user
- Format informational responses with clear headings and bullet points
- When listing lenders or items, use clean structured formatting
- If you're unsure which deal the user means, ask for clarification
- Never make up data. Use only what's provided in context.`;

function parseActions(content: string): { cleanContent: string; actions: DealAction[] } {
  const actions: DealAction[] = [];
  const actionRegex = /```action\s*\n([\s\S]*?)```/g;
  let match;
  let cleanContent = content;

  while ((match = actionRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      actions.push({
        id: crypto.randomUUID(),
        type: parsed.type,
        label: parsed.label || parsed.type,
        description: parsed.description || '',
        params: parsed.params || {},
        currentValue: parsed.currentValue,
        newValue: parsed.newValue,
      });
    } catch (e) {
      console.warn('Failed to parse action block:', e);
    }
  }

  // Remove action blocks from displayed content
  cleanContent = content.replace(/```action\s*\n[\s\S]*?```/g, '').trim();

  return { cleanContent, actions };
}

export function useDealAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Per-instance panel key for the client-side Claude request manager.
  const panelKey = useMemo(() => `deal-assistant:${crypto.randomUUID()}`, []);

  const sendMessage = useCallback(async (content: string, dealContext: DealContext) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Deterministically fetch the facts Claude might need BEFORE calling it.
      // Everything is normalized into a compact JSON <deal_facts> block; the
      // model interprets, it does not lookup. This keeps prompts small and
      // stable, and lets the model cite exact ids the UI already renders.
      const factsPayload: Record<string, unknown> = {
        deal: {
          id: dealContext.id ?? null,
          name: dealContext.company,
          value_usd: dealContext.value ?? null,
          stage: dealContext.stage,
          status: dealContext.status,
          manager: dealContext.manager ?? null,
          notes_excerpt: dealContext.notes ? dealContext.notes.slice(0, 400) : null,
        },
        funding_sources: [] as unknown[],
        outstanding_items: [] as unknown[],
      };

      if (dealContext.id) {
        const [dealRes, lendersRes, itemsRes] = await Promise.all([
          executeDealOperation('get_deal', { name_or_id: dealContext.id }),
          executeDealOperation('get_deal_lenders', { deal_id: dealContext.id }),
          executeDealOperation('get_outstanding_items', { deal_id: dealContext.id }),
        ]);

        if (dealRes.success && dealRes.data?.found) {
          const d = dealRes.data.deal;
          (factsPayload.deal as Record<string, unknown>) = {
            ...(factsPayload.deal as Record<string, unknown>),
            id: d.id ?? dealContext.id,
            name: d.name,
            value_usd: d.value,
            stage: d.stage,
            status: d.status,
            manager: d.manager ?? null,
            deal_owner: d.deal_owner ?? null,
            lender_count: d.lender_count,
            outstanding_items_count: d.outstanding_items_count,
            milestones: { completed: d.milestones_completed, total: d.milestones_total },
            flagged: d.is_flagged ? { note: d.flag_notes ?? null } : false,
            notes_excerpt: d.notes ? d.notes.slice(0, 500) : null,
            closing_date: d.closing_date ?? null,
            created_at: d.created_at,
            updated_at: d.updated_at,
          };
        }

        if (lendersRes.success && Array.isArray(lendersRes.data?.lenders)) {
          factsPayload.funding_sources = lendersRes.data.lenders.map((l: any) => ({
            id: `lender:${l.id ?? l.name}`,
            name: l.name,
            stage: l.stage,
            tracking_status: l.tracking_status,
            score: l.score ?? null,
            notes_excerpt: l.notes ? String(l.notes).slice(0, 200) : null,
          }));
        }

        if (itemsRes.success && Array.isArray(itemsRes.data?.items)) {
          factsPayload.outstanding_items = itemsRes.data.items.map((item: any) => ({
            id: `item:${item.id}`,
            status: item.status,
            priority: item.priority,
            description: item.description,
            due_date: item.due_date ?? null,
          }));
        }
      }

      const systemPrompt = `${DEAL_ASSISTANT_SYSTEM_PROMPT}

## Deal facts (authoritative — do not invent additions)
You are given a compact JSON snapshot below. Only interpret these facts; if
the answer isn't in the snapshot, say so. When you cite a lender, item, or
the deal itself, reference its \`id\` inline as [cite:<id>].

<deal_facts>
${JSON.stringify(factsPayload)}
</deal_facts>`;

      const apiMessages = [...messages, userMessage].map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const result = await sendClaudeMessage({
        messages: apiMessages,
        system: systemPrompt,
        context: 'deal-assistant' as any,
        temperature: 0.5,
        max_tokens: 2000,
        requestManager: { panelKey },
      });

      // Superseded by a newer question — drop silently.
      if (isStaleClaudeResponse(result)) return;

      if (!result.success) {
        throw new Error(result.error || 'Failed to get response');
      }

      const { cleanContent, actions } = parseActions(result.response);

      const assistantMessage: Message = {
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date(),
        actions: actions.length > 0 ? actions : undefined,
        actionStatus: actions.length > 0 ? 'pending' : undefined,
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
  }, [messages, isLoading, panelKey]);

  const executeAction = useCallback(async (messageIndex: number, actionId: string) => {
    setIsExecuting(true);

    const message = messages[messageIndex];
    const action = message?.actions?.find(a => a.id === actionId);
    if (!action) {
      setIsExecuting(false);
      return;
    }

    try {
      const actionMap: Record<string, string> = {
        update_deal_stage: 'update_deal_stage',
        update_deal_status: 'update_deal_status',
        update_deal_notes: 'update_deal_notes',
        add_lender: 'add_lender_to_deal',
        add_lenders: 'add_lenders_to_deal',
        remove_lender: 'remove_lender_from_deal',
        update_lender_stage: 'update_lender_stage',
        add_outstanding_item: 'add_outstanding_item',
        mark_outstanding_complete: 'mark_outstanding_item_complete',
      };

      const operationName = actionMap[action.type] || action.type;
      const result = await executeDealOperation(operationName, action.params);

      // Mark action as confirmed
      setMessages(prev => prev.map((m, i) => {
        if (i === messageIndex) {
          return { ...m, actionStatus: 'confirmed' as const };
        }
        return m;
      }));

      if (result.success) {
        // Add success confirmation message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ **Done!** ${action.label}\n\n${action.description}`,
          timestamp: new Date(),
        }]);

        // Dispatch event to refresh deals context
        window.dispatchEvent(new CustomEvent('copilot-action-completed', {
          detail: { actionType: action.type, ...action.params },
        }));

        toast({ title: 'Action completed', description: action.label });
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ **Failed:** ${result.error || 'Unknown error'}`,
          timestamp: new Date(),
        }]);
        toast({ title: 'Action failed', description: result.error, variant: 'destructive' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **Error:** ${errorMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsExecuting(false);
    }
  }, [messages]);

  const cancelAction = useCallback((messageIndex: number) => {
    setMessages(prev => prev.map((m, i) => {
      if (i === messageIndex) {
        return { ...m, actionStatus: 'cancelled' as const };
      }
      return m;
    }));

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '🚫 Action cancelled. Let me know if you need anything else.',
      timestamp: new Date(),
    }]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    isExecuting,
    executeAction,
    cancelAction,
  };
}
