import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunnelStep } from "@/hooks/useUXAnalytics";
import { cn } from "@/lib/utils";

interface FunnelVisualizationProps {
  title: string;
  description: string;
  steps: FunnelStep[];
}

export function FunnelVisualization({ title, description, steps }: FunnelVisualizationProps) {
  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, index) => {
          const widthPercent = (step.count / maxCount) * 100;
          const conversionFromPrevious =
            index > 0 ? ((step.count / steps[index - 1].count) * 100).toFixed(1) : "100";

          return (
            <div key={step.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{step.name}</span>
                <span className="text-muted-foreground">
                  {step.count.toLocaleString()} ({step.conversion_rate}%)
                </span>
              </div>
              <div className="relative h-8">
                <div
                  className={cn(
                    "h-full rounded transition-all",
                    index === 0
                      ? "bg-primary"
                      : index === steps.length - 1
                      ? "bg-green-500"
                      : "bg-primary/70"
                  )}
                  style={{ width: `${widthPercent}%` }}
                />
                {index > 0 && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    ↓ {conversionFromPrevious}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
