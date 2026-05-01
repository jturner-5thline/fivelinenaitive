import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCopilotStore } from '@/stores/copilotStore';
import { useAnyDialogOpen } from '@/hooks/useAnyDialogOpen';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { cn } from '@/lib/utils';

export function CopilotToggleButton() {
  const togglePanel = useCopilotStore((s) => s.togglePanel);
  const isOpen = useCopilotStore((s) => s.isOpen);
  const hasOpenModal = useAnyDialogOpen();

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

  if (isOpen) return null;
  if (hasOpenModal) return null;

  return createPortal(
    <button
      onClick={togglePanel}
      aria-label="Toggle naitive AI"
      className={cn(
        "group relative cursor-pointer overflow-hidden",
        "h-11 rounded-full",
        "w-[280px] sm:w-[640px]",
        "flex items-center gap-3 pl-1.5 pr-4",
        "text-left",
        "transition-all duration-200",
        "active:scale-[0.99]",
        "animate-in fade-in duration-150"
      )}
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        right: '16px',
        zIndex: 99999,
        background: 'rgba(14, 16, 24, 0.55)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Centered watermark emblem */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src={naitiveAiIcon}
          alt=""
          className="h-5 w-5 brightness-0 invert opacity-[0.06] transition-opacity duration-200 group-hover:opacity-[0.09]"
        />
      </span>

      {/* Left gradient logo badge */}
      <span
        aria-hidden="true"
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_10px_hsl(270_65%_55%/0.45)]"
        style={{
          background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
        }}
      >
        <img
          src={naitiveAiIcon}
          alt=""
          className="h-4 w-4 brightness-0 invert"
        />
      </span>

      {/* Placeholder text */}
      <span className="relative z-10 flex-1 truncate text-[13px] font-normal text-white/45 group-hover:text-white/60 transition-colors">
        Ask naitive AI…
      </span>

      {/* Keyboard hint */}
      <kbd className="relative z-10 hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/40 group-hover:text-white/55 transition-colors shrink-0">
        ⌘J
      </kbd>
    </button>,
    document.body
  );
}
