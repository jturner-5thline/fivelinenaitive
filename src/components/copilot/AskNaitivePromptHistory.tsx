import { useState } from 'react';
import { History, Send, Trash2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAskNaitiveHistory } from '@/lib/askNaitiveHistory';
import { cn } from '@/lib/utils';

interface AskNaitivePromptHistoryProps {
  /** Load the prompt into the composer without sending it. */
  onReuse: (prompt: string) => void;
  /** Send the prompt straight to naitive AI. */
  onRun: (prompt: string) => void;
}

function relativeTime(at: number) {
  const diff = Date.now() - at;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Compact popover listing recently submitted Ask naitive AI prompts so the
 * user can revisit, re-run, or reload them into the composer.
 */
export function AskNaitivePromptHistory({ onReuse, onRun }: AskNaitivePromptHistoryProps) {
  const { entries, remove, clear } = useAskNaitiveHistory();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Recent prompts"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                'border border-sky-400/25 bg-sky-400/[0.06] text-sky-200/70',
                'hover:text-sky-100 hover:bg-sky-400/[0.12] transition-colors',
              )}
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Recent prompts</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        onClick={(e) => e.stopPropagation()}
        className="z-[2147483001] w-[340px] p-0 overflow-hidden border-white/15 bg-[rgba(14,16,24,0.96)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            Recent prompts
          </span>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] text-white/45 hover:text-white/80 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-white/45">
            No prompts yet — your questions will show up here.
          </div>
        ) : (
          <ul className="max-h-[46vh] overflow-y-auto py-1">
            {entries.map((entry) => (
              <li key={entry.id} className="group/item flex items-start gap-2 px-2 py-1.5 hover:bg-white/[0.05]">
                <button
                  type="button"
                  title="Load into the composer"
                  onClick={() => {
                    onReuse(entry.prompt);
                    setOpen(false);
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block text-[12.5px] leading-snug text-white/85 line-clamp-2">
                    {entry.prompt}
                  </span>
                  <span className="block text-[10.5px] text-white/40 mt-0.5">
                    {relativeTime(entry.at)}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    aria-label="Run prompt again"
                    title="Run again"
                    onClick={() => {
                      onRun(entry.prompt);
                      setOpen(false);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded text-white/55 hover:text-white hover:bg-white/10"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove from history"
                    title="Remove"
                    onClick={() => remove(entry.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-white/45 hover:text-red-300 hover:bg-white/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AskNaitivePromptHistory;
