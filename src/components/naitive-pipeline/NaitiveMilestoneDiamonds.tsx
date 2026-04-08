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
      <div className="w-full">
        {showProgress && (
          <div className="text-[9px] text-muted-foreground/50 text-right mb-1">
            {completed}/{milestones.length}
          </div>
        )}
        <div
          className="grid w-full"
          style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))` }}
        >
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
                    'flex items-center justify-center transition-colors cursor-pointer rounded-sm p-1 hover:bg-muted/50',
                    m.completed
                      ? 'text-primary'
                      : 'text-muted-foreground/40 hover:text-muted-foreground'
                  )}
                >
                  <DiamondIcon filled={m.completed} className="h-3.5 w-3.5" />
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
      </div>
    </TooltipProvider>
  );
}
