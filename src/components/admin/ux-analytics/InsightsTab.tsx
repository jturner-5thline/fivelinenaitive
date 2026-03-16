import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Lightbulb,
  AlertTriangle,
  Sparkles,
  X,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Beaker,
  BarChart3,
  Zap,
  Layout,
  Workflow,
  Gauge,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UXProductInsight {
  title: string;
  description: string;
  recommendation: string;
  impact: "high" | "medium" | "low";
  category: "UX" | "Feature" | "Workflow" | "Performance";
  isSample: boolean;
}

const impactConfig = {
  high: { label: "High Impact", variant: "destructive" as const, className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800/40" },
  medium: { label: "Medium Impact", variant: "secondary" as const, className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40" },
  low: { label: "Low Impact", variant: "outline" as const, className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/40" },
};

const categoryConfig = {
  UX: { icon: Layout, color: "text-violet-600 dark:text-violet-400" },
  Feature: { icon: Zap, color: "text-emerald-600 dark:text-emerald-400" },
  Workflow: { icon: Workflow, color: "text-sky-600 dark:text-sky-400" },
  Performance: { icon: Gauge, color: "text-orange-600 dark:text-orange-400" },
};

function InsightCard({
  insight,
  onDismiss,
  onMarkAddressed,
}: {
  insight: UXProductInsight;
  onDismiss: () => void;
  onMarkAddressed: () => void;
}) {
  const impact = impactConfig[insight.impact];
  const category = categoryConfig[insight.category] || categoryConfig.UX;
  const CategoryIcon = category.icon;

  return (
    <Card className="group relative overflow-hidden">
      {insight.isSample && (
        <div className="absolute top-0 right-0">
          <Badge variant="outline" className="rounded-none rounded-bl-md border-t-0 border-r-0 text-[10px] gap-1 bg-muted/60">
            <Beaker className="h-3 w-3" />
            Sample
          </Badge>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 shrink-0", category.color)}>
            <CategoryIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pr-14">
            <CardTitle className="text-sm font-semibold leading-tight">{insight.title}</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={cn("text-[10px] border", impact.className)}>
                {impact.label}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {insight.category}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
        <div className="rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/10 p-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-foreground">{insight.recommendation}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-emerald-600"
            onClick={onMarkAddressed}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Addressed
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function InsightsTab() {
  const [insights, setInsights] = useState<UXProductInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [dataSummary, setDataSummary] = useState<{ period: string; pageViewCount: number; errorCount: number; dealCount: number } | null>(null);
  const [dismissedTitles, setDismissedTitles] = useState<Set<string>>(new Set());

  const generateInsights = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ux-insights");

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setInsights(data.insights || []);
      setHasRealData(data.hasRealData || false);
      setDataSummary(data.dataSummary || null);
      setHasGenerated(true);
      setDismissedTitles(new Set());
      toast.success(`Generated ${data.insights?.length || 0} product insights`);
    } catch (err) {
      console.error("Failed to generate insights:", err);
      toast.error("Failed to generate insights. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = (title: string) => {
    setDismissedTitles((prev) => new Set(prev).add(title));
    toast.info("Insight dismissed");
  };

  const handleMarkAddressed = (title: string) => {
    setDismissedTitles((prev) => new Set(prev).add(title));
    toast.success("Marked as addressed");
  };

  const visibleInsights = insights.filter((i) => !dismissedTitles.has(i.title));
  const highImpact = visibleInsights.filter((i) => i.impact === "high");
  const mediumImpact = visibleInsights.filter((i) => i.impact === "medium");
  const lowImpact = visibleInsights.filter((i) => i.impact === "low");
  const sampleCount = visibleInsights.filter((i) => i.isSample).length;

  if (!hasGenerated) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-lg mb-2">AI-Powered Product Insights</CardTitle>
            <CardDescription className="text-center max-w-md mb-6">
              Analyze user activity data to discover UX bottlenecks, underutilized features,
              workflow friction points, and actionable improvement recommendations.
            </CardDescription>
            <Button onClick={generateInsights} disabled={isLoading} size="lg" className="gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing activity data…
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4" />
                  Generate Insights
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Product Insights</h3>
            {sampleCount > 0 && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Beaker className="h-3 w-3" />
                {sampleCount} sample insight{sampleCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          {dataSummary && (
            <p className="text-sm text-muted-foreground mt-1">
              Based on {dataSummary.period.toLowerCase()} · {dataSummary.pageViewCount} page views · {dataSummary.errorCount} errors · {dataSummary.dealCount} deals
            </p>
          )}
          {!hasRealData && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Limited activity data — showing sample insights to demonstrate the feature
            </p>
          )}
        </div>
        <Button onClick={generateInsights} disabled={isLoading} variant="outline" size="sm" className="gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Regenerate
        </Button>
      </div>

      {/* High Impact */}
      {highImpact.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            High Impact ({highImpact.length})
          </h4>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {highImpact.map((insight) => (
              <InsightCard
                key={insight.title}
                insight={insight}
                onDismiss={() => handleDismiss(insight.title)}
                onMarkAddressed={() => handleMarkAddressed(insight.title)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Medium Impact */}
      {mediumImpact.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Lightbulb className="h-4 w-4" />
            Medium Impact ({mediumImpact.length})
          </h4>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mediumImpact.map((insight) => (
              <InsightCard
                key={insight.title}
                insight={insight}
                onDismiss={() => handleDismiss(insight.title)}
                onMarkAddressed={() => handleMarkAddressed(insight.title)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Low Impact */}
      {lowImpact.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <CheckCircle2 className="h-4 w-4" />
            Low Impact ({lowImpact.length})
          </h4>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lowImpact.map((insight) => (
              <InsightCard
                key={insight.title}
                insight={insight}
                onDismiss={() => handleDismiss(insight.title)}
                onMarkAddressed={() => handleMarkAddressed(insight.title)}
              />
            ))}
          </div>
        </div>
      )}

      {visibleInsights.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
            <CardTitle className="text-lg mb-2">All Caught Up!</CardTitle>
            <CardDescription>
              All insights have been addressed or dismissed. Click "Regenerate" for a fresh analysis.
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
