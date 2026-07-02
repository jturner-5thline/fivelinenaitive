import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function StageTransitTimeChart() {
    return (
    <Card className="glass-module max-w-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground">
          Proposal Issued-to-Signed
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-[120px] text-xs uppercase tracking-[.15em] text-muted-foreground/70">
          Data coming
        </div>
      </CardContent>
    </Card>
  );
}
