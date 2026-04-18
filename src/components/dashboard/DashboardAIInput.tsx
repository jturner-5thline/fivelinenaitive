import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { History, Maximize2, Minimize2, RotateCcw, Download, AlertCircle } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { useChatPersistence, ChatMessage } from '@/hooks/useChatPersistence';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatHistorySidebar } from './chat/ChatHistorySidebar';
import { ChatInputBar } from './chat/ChatInputBar';
import { ProactiveAlerts } from './chat/ProactiveAlerts';
import { QuickActionCards } from './chat/QuickActionCards';
import { isBriefingPrompt, BRIEFING_MARKER } from './chat/MorningBriefing';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-dashboard-chat`;
const CHAT_REQUEST_TIMEOUT_MS = 70_000;

interface AssistantErrorState {
  title: string;
  message: string;
  prompt: string;
}

interface SuggestionConfig {
  text: string;
  requiresInput: boolean;
  /** Text to populate (if different from display text) */
  populateText?: string;
}

const suggestions: SuggestionConfig[] = [
  { text: "What are we waiting on?", requiresInput: false },
  { text: "Who are our most active lenders?", requiresInput: false },
  { text: "Stale Deals Analysis", requiresInput: false },
  { text: "To-Do List", requiresInput: false },
];

interface DashboardAIInputProps {
  isDrawerMode?: boolean;
}

/** Render suggestion text with [placeholder] portions styled distinctly */
function renderSuggestionText(text: string) {
  const parts = text.split(/(\[[^\]]+\])/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return <span key={i} className="text-primary italic">{part}</span>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractTextContent).filter(Boolean).join('');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if ('content' in record) return extractTextContent(record.content);
  }
  return '';
}

function extractAssistantPayloadText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, any>;
  return [
    extractTextContent(record.choices?.[0]?.delta?.content),
    extractTextContent(record.choices?.[0]?.message?.content),
    extractTextContent(record.choices?.[0]?.text),
    extractTextContent(record.response),
    extractTextContent(record.content),
  ].find(Boolean) || '';
}

function getVisibleErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (/timed out/i.test(message)) {
    return {
      title: 'Assistant timed out',
      message: 'The AI request took too long. Please retry.',
    };
  }

  if (/empty response/i.test(message) || /malformed/i.test(message)) {
    return {
      title: 'No response returned',
      message: 'The AI request completed without a usable response. Please retry.',
    };
  }

  return {
    title: 'Assistant request failed',
    message: message || 'Something went wrong. Please retry.',
  };
}

export function DashboardAIInput({ isDrawerMode = false }: DashboardAIInputProps) {
  const { user } = useAuth();
  const { company } = useCompany();
  const {
    conversations, activeConversationId, messages, setMessages,
    loadingHistory, loadConversation, createConversation,
    saveMessage, deleteConversation, startNewChat,
  } = useChatPersistence();

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string; email: string }[]>([]);
  const [requestError, setRequestError] = useState<AssistantErrorState | null>(null);
  const autoBriefedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Determine if chat is active (has messages)
  const isChatActive = messages.length > 0;

  // Load team members for @mentions
  useEffect(() => {
    if (!user) return;
    supabase.rpc('get_team_members_for_mention', { _user_id: user.id }).then(({ data }) => {
      if (data) setTeamMembers(data.map((d: any) => ({ user_id: d.user_id, display_name: d.display_name || d.email, email: d.email })));
    });
  }, [user]);

  // Auto-briefing on first load (only once per session)
  useEffect(() => {
    if (autoBriefedRef.current || messages.length > 0 || !user) return;
    const lastBriefing = sessionStorage.getItem('lastBriefing');
    const today = new Date().toISOString().slice(0, 10);
    if (lastBriefing === today) return;
    autoBriefedRef.current = true;
  }, [user, messages.length]);

  /** Populate input and select [placeholder] if present */
  const populateInput = useCallback((text: string) => {
    setInputValue(text);
    // After React renders the new value, select the placeholder
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const bracketMatch = text.match(/\[([^\]]+)\]/);
      if (bracketMatch && bracketMatch.index !== undefined) {
        el.setSelectionRange(bracketMatch.index, bracketMatch.index + bracketMatch[0].length);
      } else {
        // Place cursor at end
        el.setSelectionRange(text.length, text.length);
      }
    }, 50);
  }, []);

  const handleSend = useCallback(async (text?: string, options?: { retry?: boolean }) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed || isLoading) return;

    const isRetry = options?.retry === true;
    const lastMessage = messages[messages.length - 1];
    const shouldReuseLastUserMessage = isRetry && lastMessage?.role === 'user' && lastMessage.content === trimmed;

    setRequestError(null);

    const userMsg: ChatMessage = { role: 'user', content: trimmed, created_at: new Date().toISOString() };
    const updatedMessages = shouldReuseLastUserMessage ? messages : [...messages, userMsg];

    if (!shouldReuseLastUserMessage) {
      setMessages(updatedMessages);
      setInputValue('');
    }

    setIsLoading(true);

    // Scroll chat into view after sending
    setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation(trimmed);
      if (!convId) {
        console.error('[DashboardAI] Failed to create conversation');
        toast.error('Failed to create conversation');
        setIsLoading(false);
        return;
      }
    }

    if (!shouldReuseLastUserMessage || !activeConversationId) {
      await saveMessage(convId, 'user', trimmed);
    }

    // Track briefings
    if (/briefing|morning|catchup|catch up/i.test(trimmed)) {
      sessionStorage.setItem('lastBriefing', new Date().toISOString().slice(0, 10));
    }

    // ── Structured morning briefing: render immediately, AI enhances later ──
    if (isBriefingPrompt(trimmed)) {
      const briefingMsg: ChatMessage = { role: 'assistant', content: BRIEFING_MARKER, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, briefingMsg]);
      if (convId) await saveMessage(convId, 'assistant', BRIEFING_MARKER);

      // Fire AI in background to optionally enhance with a summary
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          const controller = new AbortController();
          const tid = window.setTimeout(() => controller.abort(), 15_000); // short timeout for enhancement
          const resp = await fetch(CHAT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'Give me a 1-2 sentence executive summary of my day ahead. Be concise and action-oriented. Do not list items — just summarize the key theme.' }] }),
            signal: controller.signal,
          });
          window.clearTimeout(tid);
          if (resp.ok) {
            const contentType = resp.headers.get('content-type') || '';
            let aiText = '';
            if (contentType.includes('application/json')) {
              const json = await resp.json();
              aiText = extractAssistantPayloadText(json).trim();
            } else if (resp.body) {
              const reader = resp.body.getReader();
              const decoder = new TextDecoder();
              let buf = '';
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
              }
              // Try to extract from SSE lines
              for (const line of buf.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const delta = extractTextContent(parsed?.choices?.[0]?.delta?.content);
                  if (delta) aiText += delta;
                  else {
                    const full = extractAssistantPayloadText(parsed).trim();
                    if (full) aiText = full;
                  }
                } catch {}
              }
            }
            if (aiText) {
              setMessages(prev => prev.map((m, idx) =>
                idx === prev.length - 1 && m.content.startsWith(BRIEFING_MARKER)
                  ? { ...m, content: BRIEFING_MARKER + aiText }
                  : m
              ));
              if (convId) await saveMessage(convId, 'assistant', BRIEFING_MARKER + aiText);
            }
          }
        }
      } catch {
        // AI enhancement failed silently — structured briefing still renders
      }

      setIsLoading(false);
      return;
    }

    let assistantContent = '';
    const upsertAssistant = (nextContent: string, mode: 'append' | 'replace' = 'append') => {
      assistantContent = mode === 'append' ? assistantContent + nextContent : nextContent;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { role: 'assistant', content: assistantContent, created_at: new Date().toISOString() }];
      });
    };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        console.error('[DashboardAI] No auth token available');
        toast.error('Please sign in again to use the assistant.');
        setIsLoading(false);
        return;
      }

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: updatedMessages.map(m => ({ role: m.role, content: m.content })) }),
        signal: controller.signal,
      });

      if (resp.status === 429) throw new Error('Rate limit reached. Please try again in a moment.');
      if (resp.status === 402) throw new Error('AI credits exhausted.');
      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'Unknown error');
        console.error('[DashboardAI] Response error:', resp.status, errText);
        throw new Error(errText || `AI request failed (${resp.status})`);
      }
      if (!resp.body) throw new Error('No response body');

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await resp.json();
        const content = extractAssistantPayloadText(json).trim();
        if (json?.error && !content) {
          throw new Error(String(json.error));
        }
        if (!content) {
          console.error('[DashboardAI] Empty JSON response:', json);
          throw new Error('The assistant returned an empty response.');
        }
        upsertAssistant(content, 'replace');
        if (convId) await saveMessage(convId, 'assistant', content);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = extractTextContent(parsed?.choices?.[0]?.delta?.content);
            if (delta) {
              upsertAssistant(delta, 'append');
              continue;
            }

            const fullContent = extractAssistantPayloadText(parsed).trim();
            if (fullContent) {
              upsertAssistant(fullContent, 'replace');
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Process any remaining data in buffer
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = extractTextContent(parsed?.choices?.[0]?.delta?.content);
            if (delta) {
              upsertAssistant(delta, 'append');
              continue;
            }

            const fullContent = extractAssistantPayloadText(parsed).trim();
            if (fullContent) upsertAssistant(fullContent, 'replace');
          } catch {}
        }
      }

      if (!assistantContent.trim()) {
        console.error('[DashboardAI] Empty stream response', {
          prompt: trimmed,
          contentType,
          conversationId: convId,
        });
        throw new Error('The assistant returned an empty response.');
      }

      if (convId) await saveMessage(convId, 'assistant', assistantContent);
    } catch (err) {
      const visibleError = getVisibleErrorMessage(err);
      console.error('[DashboardAI] Chat error:', {
        error: err,
        prompt: trimmed,
        conversationId: convId,
      });
      setRequestError({ ...visibleError, prompt: trimmed });
      toast.error(visibleError.title, { description: visibleError.message });
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages, activeConversationId, createConversation, saveMessage, setMessages]);

  const handleCreateTask = useCallback(async (title: string, priority: string) => {
    if (!user) return;

    // Look up company_id
    const { data: memberData } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const { data: newTask, error } = await supabase.from('tasks').insert({
      title, priority, status: 'todo', user_id: user.id, assigned_to: user.id, assigned_by: user.id,
      company_id: memberData?.company_id || null,
    } as any).select().single();
    if (error) { toast.error('Failed to create task'); return; }
    toast.success(`Task created: ${title}`);

    // Fire-and-forget Asana sync
    try {
      const companyId = memberData?.company_id || null;
      const ctx = await getAsanaSyncContext(companyId);
      if (ctx && newTask) {
        const { data: profile } = await supabase.from('profiles').select('email').eq('user_id', user.id).maybeSingle();
        await syncTaskToAsana(ctx, {
          id: (newTask as any).id,
          title,
          assignee_email: profile?.email || null,
        });
      }
    } catch (e) {
      console.error('[AsanaSync] Dashboard task sync failed:', e);
    }
  }, [user]);

  const handleExport = useCallback(() => {
    if (messages.length === 0) return;
    const text = messages.map(m => `[${m.role.toUpperCase()}]${m.created_at ? ` ${new Date(m.created_at).toLocaleString()}` : ''}\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `naitive-chat-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat exported');
  }, [messages]);

  const handleShare = useCallback((content: string) => {
    if (navigator.share) {
      navigator.share({ title: 'naitive Assistant', text: content }).catch(() => {});
    } else {
      navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard — paste to share');
    }
  }, []);

  const handleClear = useCallback(() => { startNewChat(); setInputValue(''); }, [startNewChat]);

  /** Handle action from QuickActionCards */
  const handleQuickAction = useCallback((prompt: string, requiresInput: boolean) => {
    if (requiresInput) {
      populateInput(prompt);
    } else {
      setInputValue(prompt);
      handleSend(prompt);
    }
  }, [populateInput, handleSend]);

  /** Handle suggestion chip click (#7) */
  const handleSuggestionClick = useCallback((suggestion: SuggestionConfig) => {
    const textToUse = suggestion.populateText || suggestion.text;
    if (suggestion.requiresInput) {
      populateInput(textToUse);
    } else {
      // Auto-send immediately and scroll to chat
      handleSend(textToUse);
    }
  }, [populateInput, handleSend]);

  const handleRetry = useCallback(() => {
    if (!requestError?.prompt || isLoading) return;
    handleSend(requestError.prompt, { retry: true });
  }, [requestError, isLoading, handleSend]);

  return (
    <div className="relative" ref={chatSectionRef}>
      <Card className={cn(
        'shadow-lg overflow-hidden transition-all duration-300',
        isDrawerMode ? 'border-0 shadow-none h-full flex flex-col' : '',
        !isDrawerMode && expanded ? 'fixed inset-4 z-50 flex flex-col' : !isDrawerMode ? 'p-4' : '',
        // #8: Make sticky when chat is active
        !isDrawerMode && !expanded && isChatActive ? 'sticky top-4 z-30' : ''
      )}>
        {/* Toolbar — always visible when there are messages or expanded */}
        {(messages.length > 0 || expanded) && (
          <div className={cn('flex items-center justify-between gap-2', expanded ? 'p-3 border-b' : 'mb-3')}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">naitive Assistant</span>
              {isLoading && <span className="text-[10px] text-muted-foreground animate-pulse">processing...</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(!showHistory)} title="History">
                <History className="h-3.5 w-3.5" />
              </Button>
              {messages.length > 0 && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClear} title="New chat">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)} title={expanded ? 'Minimize' : 'Expand'}>
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}

        <div className={cn('flex', expanded ? 'flex-1 min-h-0' : '')}>
          {showHistory && (
            <div className={cn('shrink-0', expanded ? 'w-56 h-full' : 'w-48 max-h-[350px]')}>
              <ChatHistorySidebar conversations={conversations} activeId={activeConversationId} onSelect={loadConversation} onNew={handleClear} onDelete={deleteConversation} />
            </div>
          )}

          <div className={cn('flex-1 flex flex-col min-w-0', expanded ? 'p-4' : '')}>
            {/* #32: Hide shortcut cards and suggestion pills when chat is active */}
            {!showHistory && !isChatActive && (
              <div className="space-y-4 mb-4">
                <ProactiveAlerts onAction={(prompt) => { setInputValue(prompt); handleSend(prompt); }} />
                <QuickActionCards onAction={handleQuickAction} />
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer text-xs px-3 py-1.5 border-[hsl(263,40%,30%,0.5)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.6)_0%,hsl(263,18%,8%,0.7)_100%)] backdrop-blur-md shadow-[inset_0_1px_1px_hsl(263,40%,40%,0.1),0_2px_8px_hsl(0,0%,0%,0.3)] hover:border-[hsl(263,50%,40%,0.6)] hover:bg-[linear-gradient(135deg,hsl(260,25%,14%,0.7)_0%,hsl(263,22%,11%,0.8)_100%)] hover:shadow-[inset_0_1px_1px_hsl(263,50%,50%,0.15),0_4px_16px_hsl(263,40%,20%,0.3)] transition-all duration-300"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      {renderSuggestionText(s.text)}
                    </Badge>
                  ))}
                </div>
                {/* Subtle divider */}
                <div className="border-t border-border/10 pt-4" />
              </div>
            )}

            {/* AI conversation — renders below the header */}
            {messages.length > 0 && (
              <div className={cn(expanded ? 'flex-1 min-h-0' : 'mb-4')}>
                <ChatMessageList
                  messages={messages}
                  isLoading={isLoading}
                  onCreateTask={handleCreateTask}
                  onFollowUp={(text) => { setInputValue(text); handleSend(text); }}
                  onShareMessage={handleShare}
                  onSendAction={(prompt) => handleSend(prompt)}
                />
              </div>
            )}

            {requestError && !isLoading && (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-destructive">{requestError.title}</p>
                      <p className="text-xs text-muted-foreground">{requestError.message}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleRetry}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Input bar — always visible */}
            <ChatInputBar
              onSend={(text) => handleSend(text)}
              isLoading={isLoading}
              inputValue={inputValue}
              setInputValue={setInputValue}
              teamMembers={teamMembers}
              inputRef={inputRef}
            />
          </div>
        </div>
      </Card>

      {expanded && !isDrawerMode && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setExpanded(false)} />}
    </div>
  );
}