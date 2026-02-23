import { useState, useCallback, useEffect, useRef } from 'react';
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

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-chat`;

const suggestions = [
  "Give me my morning briefing",
  "What's my pipeline conversion rate?",
  "Research [company name] for me",
  "Draft a lender outreach email",
  "Compare my top 3 deals",
  "What's my revenue forecast this quarter?",
  "Find lenders for my biggest deal",
  "Generate a deal memo for [deal]",
];

export function DashboardAIInput() {
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
    // Don't auto-send, just pre-fill the suggestion
    autoBriefedRef.current = true;
  }, [user, messages.length]);

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, created_at: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation(trimmed);
      if (!convId) { toast.error('Failed to create conversation'); setIsLoading(false); return; }
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

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (resp.status === 429) { toast.error('Rate limit reached.'); setIsLoading(false); return; }
      if (resp.status === 402) { toast.error('AI credits exhausted.'); setIsLoading(false); return; }
      if (!resp.ok || !resp.body) throw new Error('Failed to start stream');

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
          } catch { textBuffer = line + '\n' + textBuffer; break; }
        }
      }

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
      console.error('Chat error:', err);
      toast.error('Failed to get response.');
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
      navigator.share({ title: 'nAItive Assistant', text: content }).catch(() => {});
    } else {
      navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard — paste to share');
    }
  }, []);

  const handleClear = useCallback(() => { startNewChat(); setInputValue(''); }, [startNewChat]);

  return (
    <div className="relative">
      <Card className={cn(
        'shadow-lg overflow-hidden transition-all duration-300',
        expanded ? 'fixed inset-4 z-50 flex flex-col' : 'p-4'
      )}>
        {(messages.length > 0 || expanded) && (
          <div className={cn('flex items-center justify-between gap-2', expanded ? 'p-3 border-b' : 'mb-3')}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">nAItive Assistant</span>
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
            {messages.length > 0 && (
              <div className={expanded ? 'flex-1 min-h-0' : ''}>
                <ChatMessageList
                  messages={messages}
                  isLoading={isLoading}
                  onCreateTask={handleCreateTask}
                  onFollowUp={(text) => { setInputValue(text); handleSend(text); }}
                  onShareMessage={handleShare}
                />
              </div>
            )}

            {messages.length === 0 && !showHistory && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <Badge key={i} variant="outline" className="cursor-pointer hover:bg-accent text-xs" onClick={() => { setInputValue(s); handleSend(s); }}>
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <ChatInputBar
              onSend={handleSend}
              isLoading={isLoading}
              inputValue={inputValue}
              setInputValue={setInputValue}
              teamMembers={teamMembers}
            />
          </div>
        </div>
      </Card>

      {expanded && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setExpanded(false)} />}
    </div>
  );
}
