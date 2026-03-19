import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Settings } from "lucide-react";

interface HealthScoreCardProps {
  score: number;
  totalRecommendations: number;
}

export function HealthScoreCard({ score, totalRecommendations }: HealthScoreCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-4 w-4" />
          UX Health Score
        </CardTitle>
        <CardDescription>Overall user experience quality</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-6 text-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
          <Activity className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground max-w-xs">
          UX Health Score will be calculated automatically once event tracking is enabled.
        </p>
        <Button variant="outline" size="sm" disabled>
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Configure Tracking
        </Button>
      </CardContent>
    </Card>
  );
}
