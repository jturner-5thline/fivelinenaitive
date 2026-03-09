import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useCopilotStore } from '@/stores/copilotStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import naitiveFavicon from '@/assets/naitive-favicon.png';
import { CopilotActionConfirm } from '@/components/copilot/CopilotActionConfirm';
import { CopilotEmailDraft } from '@/components/copilot/CopilotEmailDraft';
import { CopilotDealCard } from '@/components/copilot/CopilotDealCard';
import { CopilotLenderCard } from '@/components/copilot/CopilotLenderCard';
import { CopilotTaskCard } from '@/components/copilot/CopilotTaskCard';
import { CopilotPipelineSummary } from '@/components/copilot/CopilotPipelineSummary';

const COPILOT_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`;

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'hsl(var(--muted-foreground))',
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
    </div>
  );
}

function getPageContext(): { page: string; entityType: string | null; entityId: string | null } {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'deals' && parts[1]) {
    return { page: 'deal-detail', entityType: 'deal', entityId: parts[1] };
  }
  if (parts[0] === 'deals') return { page: 'deals', entityType: null, entityId: null };
  if (parts[0] === 'tasks') return { page: 'tasks', entityType: null, entityId: null };
  if (parts[0] === 'lenders' || parts[0] === 'master-lenders') return { page: 'lenders', entityType: null, entityId: null };
  if (parts[0] === 'pipeline') return { page: 'pipeline', entityType: null, entityId: null };
  return { page: parts[0] || 'dashboard', entityType: null, entityId: null };
}

/** Parse assistant content for JSON blocks (confirmations / email drafts) and render inline cards */
function CopilotAssistantContent({ content }: { content: string }) {
  // Split content into segments: plain markdown + JSON blocks
  const segments: Array<{ type: 'text' | 'confirm' | 'email' | 'deal' | 'lender' | 'task' | 'pipeline'; value: any }> = [];
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.responseType === 'deal_card') {
        segments.push({ type: 'deal', value: parsed.data });
      } else if (parsed.responseType === 'lender_card') {
        segments.push({ type: 'lender', value: parsed.data });
      } else if (parsed.responseType === 'task_card') {
        segments.push({ type: 'task', value: parsed.data });
      } else if (parsed.responseType === 'pipeline_summary') {
        segments.push({ type: 'pipeline', value: parsed.data });
      } else if (parsed.action === 'confirm' && parsed.action_type) {
        segments.push({ type: 'confirm', value: parsed });
      } else if (parsed.subject && parsed.body) {
        segments.push({ type: 'email', value: parsed });
      } else {
        segments.push({ type: 'text', value: match[0] });
      }
    } catch {
      segments.push({ type: 'text', value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  if (segments.length === 0) segments.push({ type: 'text', value: content });

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'confirm') return <CopilotActionConfirm key={i} action={seg.value} />;
        if (seg.type === 'email') return <CopilotEmailDraft key={i} draft={seg.value} />;
        if (seg.type === 'deal') return <CopilotDealCard key={i} deal={seg.value.deal} milestones={seg.value.milestones} />;
        if (seg.type === 'lender') return <CopilotLenderCard key={i} lender={seg.value} />;
        if (seg.type === 'task') return <CopilotTaskCard key={i} task={seg.value} />;
        if (seg.type === 'pipeline') return <CopilotPipelineSummary key={i} data={seg.value} />;
        return (
          <ReactMarkdown
            key={i}
            components={{
              p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
              strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
              em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
              ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-');
                return isBlock ? (
                  <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 6, fontSize: 12, overflowX: 'auto', margin: '6px 0' }}>
                    <code>{children}</code>
                  </pre>
                ) : (
                  <code style={{ background: 'rgba(0,0,0,0.25)', padding: '2px 5px', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}>{children}</code>
                );
              },
            }}
          >
            {seg.value}
          </ReactMarkdown>
        );
      })}
    </>
  );
}

export function AICopilotPanel() {
  const { isOpen, closePanel, messages, addMessage, setMessages, isProcessing, setProcessing, conversationId, setConversationId } = useCopilotStore();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversation on mount
  useEffect(() => {
    if (!isOpen || !user || messages.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from('copilot_conversations')
        .select('id, messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setConversationId(data.id);
        setMessages(
          (data.messages as any[]).map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp || Date.now()),
          }))
        );
      }
    })();
  }, [isOpen, user]);

  // Save conversation
  const saveConversation = useCallback(
    async (msgs: typeof messages) => {
      if (!user) return;
      const serialized = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp }));
      const ctx = getPageContext();
      if (conversationId) {
        await supabase
          .from('copilot_conversations')
          .update({ messages: serialized as any, page_context: ctx.page, updated_at: new Date().toISOString() })
          .eq('id', conversationId);
      } else {
        const { data } = await supabase
          .from('copilot_conversations')
          .insert({ user_id: user.id, messages: serialized as any, page_context: ctx.page })
          .select('id')
          .single();
        if (data) setConversationId(data.id);
      }
    },
    [user, conversationId, setConversationId]
  );

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
  }, [input]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closePanel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closePanel]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 200);
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: text,
      timestamp: new Date(),
    };

    addMessage(userMsg);
    setInput('');
    setProcessing(true);

    // Build history from current messages
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const ctx = getPageContext();

    // Get session token
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      toast.error('Not authenticated');
      setProcessing(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const resp = await fetch(COPILOT_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: text,
          context: {
            page: ctx.page,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
            userRole: 'member',
            companyId: '',
          },
          history,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantContent = '';
      const assistantId = crypto.randomUUID();
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
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              // Upsert the assistant message in the store
              const store = useCopilotStore.getState();
              const existing = store.messages.find((m) => m.id === assistantId);
              if (existing) {
                useCopilotStore.setState({
                  messages: store.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: assistantContent } : m
                  ),
                });
              } else {
                useCopilotStore.setState({
                  messages: [
                    ...store.messages,
                    { id: assistantId, role: 'assistant', content: assistantContent, timestamp: new Date() },
                  ],
                });
              }
            }
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
            if (content) {
              assistantContent += content;
              useCopilotStore.setState({
                messages: useCopilotStore.getState().messages.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantContent } : m
                ),
              });
            }
          } catch { /* ignore */ }
        }
      }

      // Save to DB
      const allMsgs = useCopilotStore.getState().messages;
      await saveConversation(allMsgs);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Copilot stream error:', err);
      toast.error(err.message || 'Failed to get AI response');
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      });
    } finally {
      setProcessing(false);
    }
  }, [input, isProcessing, messages, addMessage, setProcessing, saveConversation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="animate-slide-in-from-right"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 420,
        height: '100vh',
        zIndex: 51,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(8, 10, 18, 0.88)',
        backdropFilter: 'blur(24px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
        borderLeft: '1px solid var(--glass-border)',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={naitiveFavicon} alt="" style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
            nAItive Copilot
          </span>
        </div>
        <button
          onClick={closePanel}
          aria-label="Close copilot"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'hsl(var(--muted-foreground))',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Context Badge placeholder */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }} />

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'hsl(var(--muted-foreground))',
              fontSize: 13,
              textAlign: 'center',
              padding: '0 24px',
            }}
          >
            Ask me anything about your deals, tasks, or pipeline.
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 4,
                }}
              >
                {msg.role === 'assistant' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                    <img src={naitiveFavicon} alt="" style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      Copilot
                    </span>
                  </div>
                )}
                <div
                  style={{
                    maxWidth: msg.role === 'user' ? '85%' : '90%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    ...(msg.role === 'user'
                      ? {
                          background: 'rgba(126,184,247,0.12)',
                          border: '1px solid rgba(126,184,247,0.22)',
                          color: 'var(--foreground)',
                          whiteSpace: 'pre-wrap',
                        }
                      : {
                          background: 'var(--glass-surface)',
                          color: 'var(--foreground)',
                          border: '1px solid var(--glass-border)',
                        }),
                  }}
                  className="copilot-message-content"
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <CopilotAssistantContent content={msg.content} />
                  )}
                </div>
              </div>
            ))}
            {isProcessing && !messages.some((m) => m.role === 'assistant' && m.content === '') && messages[messages.length - 1]?.role === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                  <img src={naitiveFavicon} alt="" style={{ width: 16, height: 16 }} />
                  <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                    Copilot
                  </span>
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px 12px 12px 2px',
                    background: 'var(--glass-surface)',
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  <TypingIndicator />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', flexShrink: 0, borderTop: '1px solid var(--glass-border)' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            style={{
              width: '100%',
              background: 'var(--glass-surface)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
              padding: '10px 44px 10px 14px',
              fontSize: 14,
              color: 'var(--foreground)',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              transition: 'border-color 150ms',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            aria-label="Send message"
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'hsl(var(--primary))',
              color: 'white',
              border: 'none',
              cursor: input.trim() && !isProcessing ? 'pointer' : 'default',
              opacity: input.trim() && !isProcessing ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'opacity 150ms',
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
