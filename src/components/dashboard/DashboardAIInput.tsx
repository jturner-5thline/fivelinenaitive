import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { History, Maximize2, Minimize2, RotateCcw, Download, Share2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useChatPersistence, ChatMessage } from '@/hooks/useChatPersistence';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatHistorySidebar } from './chat/ChatHistorySidebar';
import { ChatInputBar } from './chat/ChatInputBar';
import { ProactiveAlerts } from './chat/ProactiveAlerts';
import { QuickActionCards } from './chat/QuickActionCards';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-chat`;

interface SuggestionConfig {
  text: string;
  requiresInput: boolean;
  /** Text to populate (if different from display text) */
  populateText?: string;
}

const suggestions: SuggestionConfig[] = [
  { text: "Give me my morning briefing", requiresInput: false },
  { text: "What's my pipeline conversion rate?", requiresInput: false },
  { text: "Research [company name] for me", requiresInput: true, populateText: "Research [company name] for me" },
  { text: "Draft a lender outreach email", requiresInput: false },
  { text: "Compare my top 3 deals", requiresInput: false },
  { text: "What's my revenue forecast this quarter?", requiresInput: false },
  { text: "Find lenders for my biggest deal", requiresInput: false },
  { text: "Generate a deal memo for [deal]", requiresInput: true, populateText: "Generate a deal memo for [deal]" },
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

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, created_at: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
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

    await saveMessage(convId, 'user', trimmed);

    // Track briefings
    if (/briefing|morning|catchup|catch up/i.test(trimmed)) {
      sessionStorage.setItem('lastBriefing', new Date().toISOString().slice(0, 10));
    }

    let assistantContent = '';
    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { role: 'assistant', content: assistantContent, created_at: new Date().toISOString() }];
      });
    };

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
      });

      if (resp.status === 429) { toast.error('Rate limit reached.'); setIsLoading(false); return; }
      if (resp.status === 402) { toast.error('AI credits exhausted.'); setIsLoading(false); return; }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'Unknown error');
        console.error('[DashboardAI] Response error:', resp.status, errText);
        throw new Error(`AI request failed (${resp.status})`);
      }
      if (!resp.body) throw new Error('No response body');

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await resp.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) upsertAssistant(content);
        if (content && convId) await saveMessage(convId, 'assistant', content);
        setIsLoading(false);
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
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* partial chunk, wait for more data */ }
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
          try { const p = JSON.parse(jsonStr); const c = p.choices?.[0]?.delta?.content; if (c) upsertAssistant(c); } catch {}
        }
      }

      if (assistantContent && convId) await saveMessage(convId, 'assistant', assistantContent);
    } catch (err) {
      console.error('[DashboardAI] Chat error:', err);
      toast.error('Failed to get response. Please try again.');
      upsertAssistant('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages, activeConversationId, createConversation, saveMessage, setMessages]);

  const handleCreateTask = useCallback(async (title: string, priority: string) => {
    if (!user) return;
    const { error } = await supabase.from('tasks').insert({
      title, priority, status: 'todo', user_id: user.id, assigned_to: user.id, assigned_by: user.id,
    } as any);
    if (error) toast.error('Failed to create task');
    else toast.success(`Task created: ${title}`);
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

            {/* Input bar — always visible */}
            <ChatInputBar
              onSend={handleSend}
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