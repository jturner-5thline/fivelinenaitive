import { useEffect } from 'react';
import { useCopilotStore } from '@/stores/copilotStore';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { cn } from '@/lib/utils';

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
      className={cn(
        "fixed bottom-6 right-16 z-50",
        "h-12 w-12 rounded-full",
        "flex items-center justify-center",
        "shadow-lg cursor-pointer",
        "hover:scale-105 active:scale-95 transition-all duration-200",
        "border-0 overflow-visible relative group",
        "shadow-[0_4px_20px_hsl(270_65%_55%/0.4)]"
      )}
      style={{
        background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
      }}
    >
      {/* Shimmer overlay */}
      <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
        <span
          className="absolute -inset-full animate-[shimmer_5s_ease-in-out_infinite]"
          style={{
            background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)',
          }}
        />
      </span>
      <img
        src={naitiveAiIcon}
        alt="naitive AI"
        className="h-7 w-7 shrink-0 brightness-0 invert relative z-10"
      />
    </button>
  );
}
