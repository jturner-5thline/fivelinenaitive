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
      className={cn('h-3.5 w-3.5 shrink-0', className)}
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
  const count = milestones.length;

  // Find the index of the last sequentially-completed milestone (left to right)
  let lastCompletedIdx = -1;
  for (let i = 0; i < count; i++) {
    if (milestones[i].completed) lastCompletedIdx = i;
    else break;
  }

  // Progress fill percentage: fill through the center of the last completed diamond
  // Each diamond center is at (i + 0.5) / count * 100%
  const fillPercent = lastCompletedIdx >= 0
    ? ((lastCompletedIdx + 0.5) / count) * 100
    : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full">
        {showProgress && (
          <div className="text-[9px] text-muted-foreground/50 text-right mb-1">
            {completed}/{count}
          </div>
        )}
        {/* Track + diamonds layered */}
        <div className="relative w-full" style={{ height: 24 }}>
          {/* Base track - runs through vertical center */}
          <div
            className="absolute left-0 right-0 rounded-full bg-muted/30"
            style={{ top: '50%', transform: 'translateY(-50%)', height: 3 }}
          />
          {/* Active fill track */}
          {fillPercent > 0 && (
            <div
              className="absolute left-0 rounded-full bg-primary/70 transition-all duration-200"
              style={{
                top: '50%',
                transform: 'translateY(-50%)',
                height: 3,
                width: `${fillPercent}%`,
              }}
            />
          )}
          {/* Diamond checkpoints */}
          <div
            className="relative grid w-full h-full"
            style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
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
                      'relative z-10 flex items-center justify-center transition-colors cursor-pointer rounded-sm hover:bg-muted/40',
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
        </div>
      </div>
    </TooltipProvider>
  );
}
