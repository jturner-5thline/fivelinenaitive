import { History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecentPromptsStripProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
  onClear: () => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * Compact one-line strip of the user's recent prompts.
 * Click a pill to re-run that prompt instantly.
 */
export function RecentPromptsStrip({
  prompts,
  onSelect,
  onClear,
  isLoading,
  className,
}: RecentPromptsStripProps) {
  if (prompts.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground',
        className,
      )}
      aria-label="Recent prompts"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <History className="h-3.5 w-3.5" />
        <span className="font-medium">Recent</span>
      </div>
      <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-thin">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(prompt)}
            disabled={isLoading}
            title={prompt}
            className={cn(
              'shrink-0 max-w-[220px] truncate rounded-full border bg-card/40 backdrop-blur-sm',
              'px-2.5 py-1 text-[11px] text-foreground/90',
              'transition-all duration-150',
              'hover:bg-muted/30 hover:border-primary/40 hover:-translate-y-px',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        title="Clear recent prompts"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
