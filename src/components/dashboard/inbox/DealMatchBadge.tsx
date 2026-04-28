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
  const isLikely = match.confidence === 'medium';
  const dealLabel = match.deal.company || match.deal.name;
  const dealLabelText = isLikely ? `Likely: ${dealLabel}` : dealLabel;
  const topReasons = match.reasons && match.reasons.length > 0 ? match.reasons : null;

  const tooltip = (
    <div className="space-y-0.5 text-[11px]">
      <div className="font-medium">{dealLabel}</div>
      {stageLabel && <div className="text-muted-foreground">Stage: {stageLabel}</div>}
      <div className="text-muted-foreground">Status: {status.label}</div>
      {match.matchedLenderName && (
        <div className="text-muted-foreground">Lender: {match.matchedLenderName}</div>
      )}
      {topReasons ? (
        <div className="pt-1 space-y-0.5 border-t border-border/40 mt-1">
          <div className="text-muted-foreground/80 font-medium">Why we matched:</div>
          {topReasons.map((r, i) => (
            <div key={i} className="text-muted-foreground/70">• {r.detail}</div>
          ))}
          <div className="text-muted-foreground/60 pt-0.5">
            Confidence: {match.confidence}{match.shouldAutoLink ? ' · auto-linked' : isLikely ? ' · confirm to link' : ''}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground/70 pt-0.5">
          Match: {match.reason} · {match.confidence}
        </div>
      )}
    </div>
  );

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 shrink-0 max-w-full">
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] h-[16px] px-1 gap-0.5 shrink-0 max-w-[160px] truncate',
                isLikely
                  ? 'bg-[hsl(var(--outlook-blue)/0.06)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)] border-dashed italic'
                  : 'bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)]'
              )}
            >
              <Briefcase className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{dealLabelText}</span>
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
            className={cn(
              'text-[10px] h-5 gap-1 text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)]',
              isLikely
                ? 'bg-[hsl(var(--outlook-blue)/0.06)] border-dashed italic'
                : 'bg-[hsl(var(--outlook-blue)/0.12)]'
            )}
          >
            <Briefcase className="h-3 w-3" />
            {dealLabelText}
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