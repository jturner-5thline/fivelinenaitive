import { useState, useCallback } from 'react';
import { History, Maximize2, Minimize2, RotateCcw, Download } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useChatPersistence, ChatMessage } from '@/hooks/useChatPersistence';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatHistorySidebar } from './chat/ChatHistorySidebar';
import { ChatInputBar } from './chat/ChatInputBar';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-chat`;

const suggestions = [
  "What deals need attention this week?",
  "Suggest tasks for my pipeline",
  "Which lenders are most active?",
  "Show me overdue milestones",
  "How do I create a new deal?",
  "Summarize recent activity",
];

export function DashboardAIInput() {
  const { user } = useAuth();
  const {
    conversations, activeConversationId, messages, setMessages,
    loadingHistory, loadConversation, createConversation,
    saveMessage, deleteConversation, startNewChat,
  } = useChatPersistence();

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, created_at: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    // Ensure we have a conversation ID
    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation(trimmed);
      if (!convId) {
        toast.error('Failed to create conversation');
        setIsLoading(false);
        return;
      }
    }

    // Save user message
    await saveMessage(convId, 'user', trimmed);

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (resp.status === 429) { toast.error('Rate limit reached. Please wait a moment.'); setIsLoading(false); return; }
      if (resp.status === 402) { toast.error('AI credits exhausted.'); setIsLoading(false); return; }
      if (!resp.ok || !resp.body) throw new Error('Failed to start stream');

      // Handle non-streaming JSON response (tool call fallback)
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

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
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
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }

      // Save assistant response
      if (assistantContent && convId) {
        await saveMessage(convId, 'assistant', assistantContent);
      }
    } catch (err) {
      console.error('Dashboard chat error:', err);
      toast.error('Failed to get response. Please try again.');
      upsertAssistant('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages, activeConversationId, createConversation, saveMessage, setMessages]);

  const handleCreateTask = useCallback(async (title: string, priority: string) => {
    if (!user) return;
    const { error } = await supabase.from('tasks').insert({
      title,
      priority,
      status: 'todo',
      user_id: user.id,
      assigned_to: user.id,
      assigned_by: user.id,
    } as any);
    if (error) {
      toast.error('Failed to create task');
    } else {
      toast.success(`Task created: ${title}`);
    }
  }, [user]);

  const handleExport = useCallback(() => {
    if (messages.length === 0) return;
    const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat exported');
  }, [messages]);

  const handleClear = useCallback(() => {
    startNewChat();
    setInputValue('');
  }, [startNewChat]);

  return (
    <div className="relative">
      <Card className={cn(
        'shadow-lg overflow-hidden transition-all duration-300',
        expanded ? 'fixed inset-4 z-50 flex flex-col' : 'p-4'
      )}>
        {/* Header with controls */}
        {(messages.length > 0 || expanded) && (
          <div className={cn('flex items-center justify-between gap-2', expanded ? 'p-3 border-b' : 'mb-3')}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">nAItive Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(!showHistory)} title="Chat history">
                <History className="h-3.5 w-3.5" />
              </Button>
              {messages.length > 0 && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export chat">
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
          {/* History sidebar */}
          {showHistory && (
            <div className={cn('shrink-0', expanded ? 'w-56 h-full' : 'w-48 max-h-[350px]')}>
              <ChatHistorySidebar
                conversations={conversations}
                activeId={activeConversationId}
                onSelect={loadConversation}
                onNew={handleClear}
                onDelete={deleteConversation}
              />
            </div>
          )}

          {/* Main chat area */}
          <div className={cn('flex-1 flex flex-col min-w-0', expanded ? 'p-4' : '')}>
            {/* Messages */}
            {messages.length > 0 && (
              <div className={expanded ? 'flex-1 min-h-0' : ''}>
                <ChatMessageList
                  messages={messages}
                  isLoading={isLoading}
                  onCreateTask={handleCreateTask}
                  onFollowUp={(text) => { setInputValue(text); handleSend(text); }}
                />
              </div>
            )}

            {/* Suggestions when empty */}
            {messages.length === 0 && !showHistory && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent text-xs"
                      onClick={() => { setInputValue(s); handleSend(s); }}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <ChatInputBar
              onSend={handleSend}
              isLoading={isLoading}
              inputValue={inputValue}
              setInputValue={setInputValue}
            />
          </div>
        </div>
      </Card>

      {/* Backdrop for expanded mode */}
      {expanded && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setExpanded(false)} />}
    </div>
  );
}
