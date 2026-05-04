import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, ArrowRight, Eye, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { NaitivePipelineRecommendation } from '@/hooks/useNaitivePipelineMetrics';

const CATEGORY_CONFIG = {
  action: { icon: ArrowRight, color: 'text-primary', bg: 'bg-primary/10' },
  insight: { icon: Eye, color: 'text-chart-4', bg: 'bg-chart-4/10' },
  opportunity: { icon: Sparkles, color: 'text-green-600', bg: 'bg-green-500/10' },
};

export function NaitivePipelineRecommendations({ recommendations }: { recommendations: NaitivePipelineRecommendation[] }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Recommendations</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        {recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No recommendations right now</p>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {recommendations.map(r => {
                const config = CATEGORY_CONFIG[r.category];
                const Icon = config.icon;
                return (
                  <div key={r.id} className={cn("flex items-start gap-2 p-2 rounded-md", config.bg)}>
                    <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", config.color)} />
                    <p className="text-xs text-foreground">{r.message}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
