import { useState } from 'react';
import { AlertTriangle, X, History, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LenderHistoryWarning } from '@/hooks/useLenderHistoryWarning';
import { useDismissLenderWarning } from '@/hooks/useLenderHistoryWarning';

interface LenderHistoryHintProps {
  warning: LenderHistoryWarning;
  dealId: string;
  onViewHistory: () => void;
  className?: string;
}

export function LenderHistoryHint({
  warning,
  dealId,
  onViewHistory,
  className,
}: LenderHistoryHintProps) {
  const [visible, setVisible] = useState(true);
  const dismissMutation = useDismissLenderWarning();

  if (!visible || warning.isDismissed) return null;

  const primaryReason = warning.matchingReasons[0] || 'similar profile';
  const passCount = warning.totalPasses;
  const dealCount = new Set(warning.matches.map(m => m.dealId)).size;

  const handleDismiss = () => {
    setVisible(false);
    dismissMutation.mutate({ dealId, lenderName: warning.lenderName });
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs',
        'bg-amber-500/10 border border-amber-500/20 text-amber-200/90',
        'animate-in fade-in slide-in-from-top-1 duration-300',
        className
      )}
    >
      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        Heads up: Passed on {dealCount} similar {dealCount === 1 ? 'deal' : 'deals'} recently
        ({primaryReason.toLowerCase()})
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1.5 text-[10px] text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10 gap-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onViewHistory();
        }}
      >
        <History className="h-3 w-3" />
        History
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 text-amber-400/50 hover:text-amber-300 hover:bg-amber-500/10"
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
