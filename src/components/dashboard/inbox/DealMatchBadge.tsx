import { Badge } from '@/components/ui/badge';
import { Briefcase } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  dealStatusBadgeMeta,
  type DealMatch,
} from '@/hooks/useDealMatchForEmail';

interface Props {
  match: DealMatch;
  /** Compact = list row pill, full = detail header pill */
  variant?: 'compact' | 'full';
}

/**
 * Inline badge surfaced on inbox rows / email detail header when an email
 * has been confidently matched to a naitive deal. Shows deal name, current
 * stage, and overall deal status (On Track / At Risk / On Hold / etc.).
 */
export function DealMatchBadge({ match, variant = 'compact' }: Props) {
  const status = dealStatusBadgeMeta(match.deal.status);
  const stageLabel = (match.deal.stage || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const tooltip = (
    <div className="space-y-0.5 text-[11px]">
      <div className="font-medium">{match.deal.company || match.deal.name}</div>
      {stageLabel && <div className="text-muted-foreground">Stage: {stageLabel}</div>}
      <div className="text-muted-foreground">Status: {status.label}</div>
      {match.matchedLenderName && (
        <div className="text-muted-foreground">Lender: {match.matchedLenderName}</div>
      )}
      <div className="text-muted-foreground/70 pt-0.5">
        Match: {match.reason} · {match.confidence}
      </div>
    </div>
  );

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 shrink-0 max-w-full">
            <Badge
              variant="outline"
              className="text-[9px] h-[16px] px-1 gap-0.5 bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)] shrink-0 max-w-[140px] truncate"
            >
              <Briefcase className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{match.deal.company || match.deal.name}</span>
            </Badge>
            <Badge
              variant="outline"
              className={cn('text-[9px] h-[16px] px-1 gap-0.5 shrink-0', status.className)}
            >
              {status.label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[10px] h-5 gap-1 bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)]"
          >
            <Briefcase className="h-3 w-3" />
            {match.deal.company || match.deal.name}
          </Badge>
          {stageLabel && (
            <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground border-border">
              {stageLabel}
            </Badge>
          )}
          <Badge variant="outline" className={cn('text-[10px] h-5', status.className)}>
            {status.label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}