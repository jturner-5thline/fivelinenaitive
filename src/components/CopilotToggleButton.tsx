import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCopilotStore } from '@/stores/copilotStore';
import { useAnyDialogOpen } from '@/hooks/useAnyDialogOpen';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { cn } from '@/lib/utils';

export function CopilotToggleButton() {
  const togglePanel = useCopilotStore((s) => s.togglePanel);
  const openPanelWithPrompt = useCopilotStore((s) => s.openPanelWithPrompt);
  const isOpen = useCopilotStore((s) => s.isOpen);
  const hasOpenModal = useAnyDialogOpen();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    openPanelWithPrompt(text);
    setValue('');
  };

  return createPortal(
    <div
      role="search"
      aria-label="Ask naitive AI"
      className={cn(
        "group relative overflow-hidden",
        "h-11 rounded-full",
        "w-[280px] sm:w-[430px]",
        "flex items-center gap-3 pl-1.5 pr-4",
        "text-left",
        "transition-all duration-200",
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
      onClick={() => inputRef.current?.focus()}
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
      <button
        type="button"
        aria-label="Open naitive AI"
        onClick={(e) => { e.stopPropagation(); togglePanel(); }}
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_10px_hsl(270_65%_55%/0.45)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
        style={{
          background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
        }}
      >
        <img
          src={naitiveAiIcon}
          alt=""
          className="h-4 w-4 brightness-0 invert"
        />
      </button>

      {/* Inline input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask naitive AI…"
        aria-label="Ask naitive AI"
        className="relative z-10 flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] font-normal text-white/85 placeholder:text-white/45"
      />

      {/* Keyboard hint */}
      <kbd className="relative z-10 hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/40 group-hover:text-white/55 transition-colors shrink-0">
        ⌘J
      </kbd>
    </div>,
    document.body
  );
}
