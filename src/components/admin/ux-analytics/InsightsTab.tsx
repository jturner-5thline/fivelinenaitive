import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Minus, Copy, Check, Lightbulb, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useUXRecommendations, UXInsight } from "@/hooks/useUXAnalytics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface InsightCardProps {
  insight: UXInsight;
}

function InsightCard({ insight }: InsightCardProps) {
  const [copied, setCopied] = useState(false);

  const getTrendIcon = () => {
    switch (insight.trend) {
      case "up":
        return <TrendingUp className="h-4 w-4" />;
      case "down":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const getCategoryColor = () => {
    switch (insight.category) {
      case "positive":
        return "text-green-600 bg-green-50 dark:bg-green-950/30";
      case "negative":
        return "text-red-600 bg-red-50 dark:bg-red-950/30";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  const getCategoryIcon = () => {
    switch (insight.category) {
      case "positive":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "negative":
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(insight.prompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {getCategoryIcon()}
                <CardTitle className="text-sm font-medium">{insight.title}</CardTitle>
              </div>
              <Badge variant="outline" className={cn("text-xs", getCategoryColor())}>
                <span className="flex items-center gap-1">
                  {getTrendIcon()}
                  {insight.trend}
                </span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{insight.metric_value}</p>
            <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getCategoryIcon()}
            {insight.title}
          </DialogTitle>
          <DialogDescription>{insight.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <p className="text-sm font-medium mb-2">Current Value</p>
            <p className="text-3xl font-bold">{insight.metric_value}</p>
            <Badge variant="outline" className={cn("mt-2", getCategoryColor())}>
              <span className="flex items-center gap-1">
                {getTrendIcon()}
                Trend: {insight.trend}
              </span>
            </Badge>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Details</p>
            <p className="text-sm text-muted-foreground">{insight.details}</p>
          </div>

          {insight.recommendations.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Recommendations
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                {insight.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {insight.prompt && (
            <Button
              variant="outline"
              className="w-full"
              onClick={copyPrompt}
            >
              {copied ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy Lovable Prompt
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InsightsTab() {
  const { insights } = useUXRecommendations();

  const positiveInsights = insights.filter((i) => i.category === "positive");
  const negativeInsights = insights.filter((i) => i.category === "negative");
  const neutralInsights = insights.filter((i) => i.category === "neutral");

  return (
    <div className="space-y-6">
      {negativeInsights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Issues Requiring Attention ({negativeInsights.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {negativeInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {positiveInsights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Performing Well ({positiveInsights.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {positiveInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {neutralInsights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            Monitoring ({neutralInsights.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {neutralInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {insights.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">No Insights Yet</CardTitle>
            <CardDescription>
              Insights will appear as user activity is tracked
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
