import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphValidationResult } from './useGraphValidation';

interface GraphValidationPanelProps {
  validation: GraphValidationResult;
}

export function GraphValidationPanel({ validation }: GraphValidationPanelProps) {
  const { errorCount, warningCount, globalIssues } = validation;
  const isClean = errorCount === 0 && warningCount === 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      {isClean ? (
        <div className="flex items-center gap-1 text-muted-foreground/60">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Valid</span>
        </div>
      ) : (
        <>
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-1 text-chart-3">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
