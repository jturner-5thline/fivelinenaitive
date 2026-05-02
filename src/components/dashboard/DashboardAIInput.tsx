import { useState, useCallback, useEffect, useRef } from 'react';
import { History, Maximize2, Minimize2, RotateCcw, Download, AlertCircle, FileText, FileDown } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { useChatPersistence, ChatMessage } from '@/hooks/useChatPersistence';
import { useRecentPrompts } from '@/hooks/useRecentPrompts';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatHistorySidebar } from './chat/ChatHistorySidebar';
import { ChatInputBar } from './chat/ChatInputBar';
import { ProactiveAlerts } from './chat/ProactiveAlerts';
import { RecentPromptsStrip } from './chat/RecentPromptsStrip';
import { QuickActionChips } from './chat/QuickActionChips';
import { isBriefingPrompt, BRIEFING_MARKER } from './chat/MorningBriefing';
import {
  INTEL_BRIEF_MARKER,
  shouldAutoShowIntelBrief,
  markIntelBriefShown,
} from './chat/MorningIntelligenceBrief';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-dashboard-chat`;
const CHAT_REQUEST_TIMEOUT_MS = 70_000;

interface AssistantErrorState {
  title: string;
  message: string;
  prompt: string;
}

interface DashboardAIInputProps {
  isDrawerMode?: boolean;
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
  const { prompts: recentPrompts, recordPrompt, clearPrompts } = useRecentPrompts();

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string; email: string }[]>([]);
  const [requestError, setRequestError] = useState<AssistantErrorState | null>(null);
  const autoBriefedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const didResetOnMountRef = useRef(false);

  // Determine if chat is active (has messages)
  const isChatActive = messages.length > 0;

  // Always land on a fresh assistant when the dashboard is mounted or
  // refreshed. Without this, the auto-resume effect inside
  // useChatPersistence rehydrates the most recent conversation (e.g. the
  // last "deal rundown" response) and the empty hero state never shows.
  // We run this exactly once per mount, before auto-resume can fire,
  // and clear the localStorage hint so subsequent refreshes also stay
  // clean. In-session navigation away from the dashboard is unaffected
  // because the hook's state is local to this component instance.
  useEffect(() => {
    if (didResetOnMountRef.current) return;
    didResetOnMountRef.current = true;
    try {
      // Clear the persisted "last open conversation" hint so the
      // auto-resume effect has nothing to rehydrate.
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('dashboardChat:activeConversationId'))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // ignore storage errors (private mode, quota)
    }
    // Reset the assistant: clears messages, active conversation id, and
    // marks auto-resume as already handled so the hook will not re-load.
    startNewChat();
    setInputValue('');
    setRequestError(null);
    setExpanded(false);
    setShowHistory(false);
    // Mount-only: intentionally no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Track this prompt for the Recent strip — but skip pure retries so the
    // list reflects distinct user intents, not error recoveries.
    if (!isRetry) {
      recordPrompt(trimmed);
    }

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
  }, [inputValue, isLoading, messages, activeConversationId, createConversation, saveMessage, setMessages, recordPrompt]);

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

  const handleExportPdf = useCallback(async () => {
    if (messages.length === 0) return;
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      const ensureSpace = (lineHeight: number) => {
        if (y + lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      ensureSpace(22);
      doc.text('naitive Assistant — Chat Transcript', margin, y);
      y += 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(120);
      ensureSpace(14);
      doc.text(`Exported ${new Date().toLocaleString()}`, margin, y);
      y += 18;
      doc.setTextColor(0);

      messages.forEach((m, idx) => {
        const header = `${m.role === 'user' ? 'You' : 'Assistant'}${m.created_at ? ` · ${new Date(m.created_at).toLocaleString()}` : ''}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        ensureSpace(16);
        doc.text(header, margin, y);
        y += 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(m.content || '', maxWidth) as string[];
        for (const line of lines) {
          ensureSpace(14);
          doc.text(line, margin, y);
          y += 14;
        }

        if (idx < messages.length - 1) {
          y += 8;
          ensureSpace(2);
          doc.setDrawColor(220);
          doc.line(margin, y, pageWidth - margin, y);
          y += 12;
        }
      });

      doc.save(`naitive-chat-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Chat exported as PDF');
    } catch (err) {
      console.error('[DashboardAI] PDF export failed:', err);
      toast.error('Failed to export PDF');
    }
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

  const handleRetry = useCallback(() => {
    if (!requestError?.prompt || isLoading) return;
    handleSend(requestError.prompt, { retry: true });
  }, [requestError, isLoading, handleSend]);

  return (
    <div className="relative" ref={chatSectionRef}>
      <Card className={cn(
        'overflow-hidden transition-all duration-300',
        isDrawerMode ? 'border-0 shadow-none h-full flex flex-col' : '',
        !isDrawerMode && expanded
          ? 'fixed inset-4 z-50 flex flex-col shadow-lg'
          : !isDrawerMode && isChatActive
            // Active chat keeps the framed surface so the transcript reads as a panel
            ? 'p-4 shadow-lg sticky top-4 z-30'
            : !isDrawerMode
              // Idle state: keep the same card surface as MyTasks/MyDeals
              // widgets so the composer feels like a sibling module, with
              // a softer border so it still reads as an input affordance.
              ? 'p-3 border-border/40 hover:border-border/60'
              : ''
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Export transcript">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={handleExport} className="text-xs">
                        <FileText className="mr-2 h-3.5 w-3.5" />
                        Download as text
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportPdf} className="text-xs">
                        <FileDown className="mr-2 h-3.5 w-3.5" />
                        Download as PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            {/* #32: Hide shortcut cards when chat is active.
                ProactiveAlerts returns null when there are no alerts and
                manages its own bottom spacing, so we render it directly
                without an outer wrapper to avoid an empty bordered strip
                above the composer. */}
            {!showHistory && !isChatActive && (
              <ProactiveAlerts onAction={(prompt) => { setInputValue(prompt); handleSend(prompt); }} />
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

            {/* Recent prompts — gated to input focus, mirrors quick-action chips */}
            {!isChatActive && !showHistory && recentPrompts.length > 0 && (
              <div
                className={cn(
                  'overflow-hidden transition-all duration-200 ease-out',
                  (isInputFocused || inputValue.length > 0)
                    ? 'mb-2 max-h-24 opacity-100 translate-y-0'
                    : 'mb-0 max-h-0 opacity-0 -translate-y-1 pointer-events-none',
                )}
                aria-hidden={!(isInputFocused || inputValue.length > 0)}
              >
                <RecentPromptsStrip
                  prompts={recentPrompts}
                  onSelect={(prompt) => { setInputValue(prompt); handleSend(prompt); }}
                  onClear={clearPrompts}
                  isLoading={isLoading}
                />
              </div>
            )}
            <ChatInputBar
              onSend={(text) => handleSend(text)}
              isLoading={isLoading}
              inputValue={inputValue}
              setInputValue={setInputValue}
              teamMembers={teamMembers}
              inputRef={inputRef}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
            />
            {/* Quick-action chips appear below the input on focus or while
                composing, then collapse out when the input is empty + blurred. */}
            {!isChatActive && !showHistory && (
              <div
                className={cn(
                  'overflow-hidden transition-all duration-200 ease-out',
                  (isInputFocused || inputValue.length > 0)
                    ? 'mt-2 max-h-24 opacity-100 translate-y-0'
                    : 'mt-0 max-h-0 opacity-0 -translate-y-1 pointer-events-none',
                )}
                aria-hidden={!(isInputFocused || inputValue.length > 0)}
              >
                <QuickActionChips
                  onSelect={(prompt) => { setInputValue(prompt); handleSend(prompt); }}
                  isLoading={isLoading}
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {expanded && !isDrawerMode && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setExpanded(false)} />}
    </div>
  );
}