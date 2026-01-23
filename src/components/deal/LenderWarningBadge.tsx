import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { LenderPassPattern, PASS_REASON_LABELS } from '@/hooks/useLenderDisqualifications';

interface LenderWarningBadgeProps {
  warnings: LenderPassPattern[];
  showDetails?: boolean;
  size?: 'sm' | 'default';
}

export function LenderWarningBadge({ 
  warnings, 
  showDetails = false,
  size = 'default',
}: LenderWarningBadgeProps) {
  if (warnings.length === 0) return null;

  const highConfidenceCount = warnings.filter(w => w.confidence_score >= 0.7).length;
  const isHighRisk = highConfidenceCount > 0;

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const badgeSize = size === 'sm' ? 'text-[10px] px-1.5 py-0' : '';

  if (!showDetails) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`gap-1 ${badgeSize} ${
              isHighRisk 
                ? 'border-destructive/50 bg-destructive/10 text-destructive' 
                : 'border-amber-500/50 bg-amber-500/10 text-amber-600'
            }`}
          >
            <AlertTriangle className={iconSize} />
            {warnings.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{warnings.length} past issue{warnings.length > 1 ? 's' : ''} with similar deals</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge 
          variant="outline" 
          className={`gap-1 cursor-pointer ${badgeSize} ${
            isHighRisk 
              ? 'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20' 
              : 'border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
          }`}
        >
          <AlertTriangle className={iconSize} />
          {isHighRisk ? 'High Risk' : 'Caution'}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isHighRisk ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            <h4 className="font-semibold">
              {isHighRisk ? 'High Risk Lender' : 'Potential Concerns'}
            </h4>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Based on past deal activity, this lender has shown patterns that may affect this deal:
          </p>

          <div className="space-y-2">
            {warnings.slice(0, 3).map((warning) => (
              <div 
                key={warning.id} 
                className="flex items-start gap-2 text-sm rounded-md bg-muted/50 p-2"
              >
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">
                    {PASS_REASON_LABELS[warning.reason_category]}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {warning.occurrence_count} similar case{warning.occurrence_count > 1 ? 's' : ''} • 
                    {' '}{Math.round(warning.confidence_score * 100)}% confidence
                  </p>
                </div>
              </div>
            ))}
            {warnings.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{warnings.length - 3} more concern{warnings.length - 3 > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
