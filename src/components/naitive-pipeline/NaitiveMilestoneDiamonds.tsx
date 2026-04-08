import { DealStageMilestone } from '@/hooks/useNaitiveStageMilestones';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  milestones: DealStageMilestone[];
  onToggle: (milestoneKey: string) => void;
  showProgress?: boolean;
}

function DiamondIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('h-3 w-3 shrink-0', className)}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />
    </svg>
  );
}

export function NaitiveMilestoneDiamonds({ milestones, onToggle, showProgress }: Props) {
  if (milestones.length === 0) return null;

  const completed = milestones.filter((m) => m.completed).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {milestones.map((m) => (
            <Tooltip key={m.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(m.key);
                  }}
                  className={cn(
                    'transition-colors cursor-pointer rounded-sm p-0.5 hover:bg-muted',
                    m.completed
                      ? 'text-primary'
                      : 'text-muted-foreground/40 hover:text-muted-foreground'
                  )}
                >
                  <DiamondIcon filled={m.completed} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <span>{m.label}</span>
                <span className="ml-1 text-muted-foreground">
                  {m.completed ? '✓' : '○'}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {showProgress && (
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
            {completed}/{milestones.length}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
