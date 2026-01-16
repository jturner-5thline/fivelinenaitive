import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Lightbulb, AlertTriangle, TrendingUp, Sparkles, RefreshCw, Target, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDealsContext } from "@/contexts/DealsContext";
import { useLenders } from "@/contexts/LendersContext";
import { supabase } from "@/integrations/supabase/client";

interface PipelineHealth {
  score: number;
  summary: string;
  metrics: {
    totalValue: number;
    activeDeals: number;
    avgDealSize: number;
  };
}

interface RiskAlert {
  dealName: string;
  issue: string;
  priority: "high" | "medium" | "low";
  recommendation: string;
}

interface Opportunity {
  dealName: string;
  opportunity: string;
  potentialValue: number;
}

interface Recommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

interface Trend {
  trend: string;
  insight: string;
}

interface InsightsData {
  pipelineHealth: PipelineHealth;
  riskAlerts: RiskAlert[];
  opportunities: Opportunity[];
  recommendations: Recommendation[];
  trends: Trend[];
}

export default function Insights() {
  const { deals } = useDealsContext();
  const { lenders } = useLenders();
  const { toast } = useToast();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generateInsights = async () => {
    if (!deals || deals.length === 0) {
      toast({
        title: "No deals found",
        description: "Add some deals to generate insights.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-insights", {
        body: { deals, lenders },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setInsights(data.insights);
      toast({
        title: "Insights generated",
        description: "AI analysis complete.",
      });
    } catch (error) {
      console.error("Failed to generate insights:", error);
      toast({
        title: "Failed to generate insights",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "secondary";
      case "low":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high":
        return "text-green-600 dark:text-green-400";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400";
      case "low":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  };

  return (
    <>
      <Helmet>
        <title>Insights | 5thLine</title>
      </Helmet>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
            <p className="text-muted-foreground mt-1">
              AI-powered insights and recommendations for your deals
            </p>
          </div>
          <Button onClick={generateInsights} disabled={isLoading}>
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {isLoading ? "Analyzing..." : "Generate Insights"}
          </Button>
        </div>

        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !insights && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Generate AI Insights</h3>
            <p className="text-muted-foreground max-w-md mt-2 mb-6">
              Click the button above to analyze your deal pipeline and get AI-powered 
              recommendations for improving your outcomes.
            </p>
            <p className="text-sm text-muted-foreground">
              {deals?.length || 0} deals available for analysis
            </p>
          </div>
        )}

        {!isLoading && insights && (
          <div className="space-y-6">
            {/* Pipeline Health Score */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Pipeline Health
                    </CardTitle>
                    <CardDescription>{insights.pipelineHealth.summary}</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">{insights.pipelineHealth.score}</div>
                    <div className="text-sm text-muted-foreground">/ 100</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={insights.pipelineHealth.score} className="h-3 mb-4" />
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-semibold">
                      {formatCurrency(insights.pipelineHealth.metrics.totalValue)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Value</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">
                      {insights.pipelineHealth.metrics.activeDeals}
                    </div>
                    <div className="text-sm text-muted-foreground">Active Deals</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">
                      {formatCurrency(insights.pipelineHealth.metrics.avgDealSize)}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Deal Size</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Risk Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Risk Alerts
                  </CardTitle>
                  <CardDescription>Deals that may need your attention</CardDescription>
                </CardHeader>
                <CardContent>
                  {insights.riskAlerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No risk alerts at this time.</p>
                  ) : (
                    <div className="space-y-4">
                      {insights.riskAlerts.map((alert, i) => (
                        <div key={i} className="border-b pb-3 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{alert.dealName}</span>
                            <Badge variant={getPriorityColor(alert.priority)}>
                              {alert.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-1">{alert.issue}</p>
                          <p className="text-sm text-primary">{alert.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Opportunities */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Opportunities
                  </CardTitle>
                  <CardDescription>Promising deals and quick wins</CardDescription>
                </CardHeader>
                <CardContent>
                  {insights.opportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No specific opportunities identified.</p>
                  ) : (
                    <div className="space-y-4">
                      {insights.opportunities.map((opp, i) => (
                        <div key={i} className="border-b pb-3 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{opp.dealName}</span>
                            <span className="text-sm font-semibold text-green-600">
                              {formatCurrency(opp.potentialValue)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{opp.opportunity}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Recommendations
                </CardTitle>
                <CardDescription>Actionable steps to improve your pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {insights.recommendations.map((rec, i) => (
                    <div key={i} className="p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{rec.title}</h4>
                        <span className={`text-xs font-medium ${getImpactColor(rec.impact)}`}>
                          {rec.impact} impact
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Trends */}
            {insights.trends.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Trends & Patterns
                  </CardTitle>
                  <CardDescription>Patterns observed in your data</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {insights.trends.map((trend, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div>
                          <span className="font-medium">{trend.trend}:</span>{" "}
                          <span className="text-muted-foreground">{trend.insight}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
