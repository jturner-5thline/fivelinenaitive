import { Sparkles, X } from 'lucide-react';
import type { ProactiveNudge } from '@/hooks/useProactiveNudges';

interface Props {
  nudge: ProactiveNudge;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
}

export function CopilotProactiveNudge({ nudge, onAction, onDismiss }: Props) {
  return (
    <div
      style={{
        background: 'rgba(126,184,247,0.04)',
        border: '1px solid rgba(126,184,247,0.15)',
        borderRadius: 8,
        padding: '10px 14px',
        position: 'relative',
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'hsl(var(--muted-foreground))',
          padding: 2,
          borderRadius: 4,
          display: 'flex',
          transition: 'color 150ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >
        <X size={12} />
      </button>

      {/* Content */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingRight: 16 }}>
        <Sparkles size={14} style={{ color: 'rgba(126,184,247,0.6)', marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 12, color: 'var(--foreground)', lineHeight: 1.4, margin: '0 0 8px 0' }}>
            {nudge.message}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {nudge.actions.map((action, i) => {
              if (action.label === 'Dismiss') {
                return (
                  <button
                    key={i}
                    onClick={onDismiss}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      background: 'transparent',
                      border: '1px solid var(--glass-border)',
                      color: 'hsl(var(--muted-foreground))',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                  >
                    {action.label}
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => onAction(action.prompt)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: 'rgba(126,184,247,0.1)',
                    border: '1px solid rgba(126,184,247,0.25)',
                    color: 'hsl(var(--primary))',
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(126,184,247,0.18)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(126,184,247,0.1)')}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
