import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export function FinServFinancialMetricsDashboard() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">FinServ Financial Metrics</h3>
          <p className="text-sm text-muted-foreground">No widgets configured for this dashboard.</p>
        </CardContent>
      </Card>
    </div>
  );
}
