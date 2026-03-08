import { Diamond } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SourceTierIndicatorProps {
  tier: 1 | 2 | 3;
  className?: string;
}

const tierInfo = {
  1: { label: 'Tier 1 Source', desc: 'Major financial publication (WSJ, Bloomberg, Reuters, FT)', color: 'text-blue-400' },
  2: { label: 'Tier 2 Source', desc: 'Industry publication (Private Debt Investor, PitchBook, LCD)', color: 'text-muted-foreground' },
  3: { label: 'Tier 3 Source', desc: 'Blog, press release, or general news', color: '' },
};

export function SourceTierIndicator({ tier, className }: SourceTierIndicatorProps) {
  if (tier === 3) return null;

  const info = tierInfo[tier];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Diamond className={cn('h-3 w-3 flex-shrink-0 fill-current', info.color, className)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <p className="font-medium text-xs">{info.label}</p>
          <p className="text-[10px] text-muted-foreground">{info.desc}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
