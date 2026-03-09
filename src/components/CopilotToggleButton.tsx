import { useEffect } from 'react';
import { useCopilotStore } from '@/stores/copilotStore';
import naitiveFavicon from '@/assets/naitive-favicon.png';

export function CopilotToggleButton() {
  const togglePanel = useCopilotStore((s) => s.togglePanel);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel]);

  return (
    <button
      onClick={togglePanel}
      aria-label="Toggle naitive AI"
      className="copilot-toggle-btn"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 50,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'var(--glass-surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border-accent)',
        boxShadow: 'var(--glass-shadow), 0 0 20px rgba(126,184,247,0.15)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(126,184,247,0.4)';
        e.currentTarget.style.boxShadow = 'var(--glass-shadow), 0 0 28px rgba(126,184,247,0.3)';
        e.currentTarget.style.transform = 'scale(1.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '';
        e.currentTarget.style.boxShadow = 'var(--glass-shadow), 0 0 20px rgba(126,184,247,0.15)';
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <img src={naitiveFavicon} alt="AI Copilot" style={{ width: 24, height: 24 }} />
    </button>
  );
}
