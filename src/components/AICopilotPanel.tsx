import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useCopilotStore } from '@/stores/copilotStore';
import naitiveFavicon from '@/assets/naitive-favicon.png';

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

export function AICopilotPanel() {
  const { isOpen, closePanel, messages, addMessage, isProcessing } = useCopilotStore();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'; // max ~4 rows
  }, [input]);

  // Scroll to bottom on new messages
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

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    setInput('');

    // Placeholder assistant reply with markdown
    setTimeout(() => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "I'm being configured — I'll be able to help soon.\n\n**Features I'll support:**\n\n- Deal insights\n- Task summaries\n- Pipeline analysis\n- Context-aware suggestions",
        timestamp: new Date(),
      });
    }, 400);
  }, [input, addMessage]);

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
                    <ReactMarkdown
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
                            <pre
                              style={{
                                background: 'rgba(0,0,0,0.3)',
                                padding: '8px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                overflowX: 'auto',
                                margin: '6px 0',
                              }}
                            >
                              <code>{children}</code>
                            </pre>
                          ) : (
                            <code
                              style={{
                                background: 'rgba(0,0,0,0.25)',
                                padding: '2px 5px',
                                borderRadius: 4,
                                fontSize: 13,
                                fontFamily: 'monospace',
                              }}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
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
            disabled={!input.trim()}
            aria-label="Send message"
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: input.trim() ? 'hsl(var(--primary))' : 'hsl(var(--primary))',
              color: 'white',
              border: 'none',
              cursor: input.trim() ? 'pointer' : 'default',
              opacity: input.trim() ? 1 : 0.5,
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
