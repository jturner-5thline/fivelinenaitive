import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebtAdvisoryComparisonMode } from '@/hooks/useDebtAdvisoryComparisonMode';

export function DebtAdvisoryComparisonToggle() {
  const [mode, setMode] = useDebtAdvisoryComparisonMode();
  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as 'variance' | 'plan')}>
      <TabsList className="bg-muted/40 border border-border/40 h-9">
        <TabsTrigger
          value="variance"
          className="gap-1.5 text-xs"
          title="Period-over-period change vs the equal-length prior window"
        >
          Variance
        </TabsTrigger>
        <TabsTrigger
          value="plan"
          className="gap-1.5 text-xs"
          title="Actual vs Master Plan for the selected period"
        >
          Performance to Plan
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}