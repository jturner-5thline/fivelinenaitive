import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard } from 'lucide-react';

export function SalesTeamBoardDashboard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <LayoutDashboard className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
        <p className="text-sm font-medium">No widgets configured</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add widgets to start tracking your sales team's performance.
        </p>
      </CardContent>
    </Card>
  );
}
