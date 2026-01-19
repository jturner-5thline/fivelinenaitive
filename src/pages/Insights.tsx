import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Lightbulb, AlertTriangle, TrendingUp, Sparkles, RefreshCw, Target, Activity, History, ChevronDown, Trash2, ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDealsContext } from "@/contexts/DealsContext";
import { useLenders } from "@/contexts/LendersContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HealthScoreTrendChart } from "@/components/insights/HealthScoreTrendChart";

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

interface HistoricalInsight {
  id: string;
  created_at: string;
  pipeline_health_score: number;
  pipeline_health_summary: string;
  total_value: number;
  active_deals: number;
  avg_deal_size: number;
  risk_alerts: RiskAlert[];
  opportunities: Opportunity[];
  recommendations: Recommendation[];
  trends: Trend[];
}

export default function Insights() {
  const { deals } = useDealsContext();
  const { lenders } = useLenders();
  const { user } = useAuth();
  const { toast } = useToast();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<HistoricalInsight[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<HistoricalInsight | null>(null);

  // Fetch historical insights
  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from("insights_history")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) throw error;
        
        const typedData = (data || []).map((item: any) => ({
          ...item,
          risk_alerts: item.risk_alerts as RiskAlert[],
          opportunities: item.opportunities as Opportunity[],
          recommendations: item.recommendations as Recommendation[],
          trends: item.trends as Trend[],
        }));
        
        setHistory(typedData);
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [user]);

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

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setInsights(data.insights);

      // Save to history
      if (user && data.insights) {
        const { error: saveError } = await supabase.from("insights_history").insert({
          user_id: user.id,
          pipeline_health_score: data.insights.pipelineHealth.score,
          pipeline_health_summary: data.insights.pipelineHealth.summary,
          total_value: data.insights.pipelineHealth.metrics.totalValue,
          active_deals: data.insights.pipelineHealth.metrics.activeDeals,
          avg_deal_size: data.insights.pipelineHealth.metrics.avgDealSize,
          risk_alerts: data.insights.riskAlerts,
          opportunities: data.insights.opportunities,
          recommendations: data.insights.recommendations,
          trends: data.insights.trends,
          deals_snapshot: deals.map((d: any) => ({ id: d.id, company: d.company, value: d.value, stage: d.stage })),
        });

        if (saveError) {
          console.error("Failed to save insights:", saveError);
        } else {
          // Refresh history
          const { data: newHistory } = await supabase
            .from("insights_history")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(10);
          
          if (newHistory) {
            const typedData = newHistory.map((item: any) => ({
              ...item,
              risk_alerts: item.risk_alerts as RiskAlert[],
              opportunities: item.opportunities as Opportunity[],
              recommendations: item.recommendations as Recommendation[],
              trends: item.trends as Trend[],
            }));
            setHistory(typedData);
          }
        }
      }

      toast({
        title: "Insights generated",
        description: "AI analysis complete and saved to history.",
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

  const loadHistoricalInsight = (item: HistoricalInsight) => {
    setInsights({
      pipelineHealth: {
        score: item.pipeline_health_score,
        summary: item.pipeline_health_summary || "",
        metrics: {
          totalValue: Number(item.total_value) || 0,
          activeDeals: item.active_deals || 0,
          avgDealSize: Number(item.avg_deal_size) || 0,
        },
      },
      riskAlerts: item.risk_alerts || [],
      opportunities: item.opportunities || [],
      recommendations: item.recommendations || [],
      trends: item.trends || [],
    });
    toast({
      title: "Historical insight loaded",
      description: `Viewing insights from ${format(new Date(item.created_at), "MMM d, yyyy 'at' h:mm a")}`,
    });
  };

  const deleteHistoricalInsight = async (id: string) => {
    try {
      const { error } = await supabase.from("insights_history").delete().eq("id", id);
      if (error) throw error;
      setHistory((prev) => prev.filter((item) => item.id !== id));
      toast({ title: "Insight deleted" });
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const openCompareDialog = (item: HistoricalInsight) => {
    setSelectedForCompare(item);
    setCompareDialogOpen(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "destructive";
      case "medium": return "secondary";
      case "low": return "outline";
      default: return "secondary";
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high": return "text-green-600 dark:text-green-400";
      case "medium": return "text-yellow-600 dark:text-yellow-400";
      case "low": return "text-muted-foreground";
      default: return "text-muted-foreground";
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

  const getScoreChange = (current: number, previous: number) => {
    const diff = current - previous;
    if (diff > 0) return { text: `+${diff}`, color: "text-green-600" };
    if (diff < 0) return { text: `${diff}`, color: "text-red-600" };
    return { text: "0", color: "text-muted-foreground" };
  };

  return (
    <>
      <Helmet>
        <title>Insights | 5thLine</title>
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
            <p className="text-muted-foreground mt-1">
              AI-powered insights and recommendations for your deals
            </p>
          </div>
          <div className="flex gap-2">
            {history.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <History className="h-4 w-4 mr-2" />
                    History
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 bg-popover">
                  {history.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div 
                        className="flex-1"
                        onClick={() => loadHistoricalInsight(item)}
                      >
                        <div className="font-medium">
                          Score: {item.pipeline_health_score}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCompareDialog(item);
                          }}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoricalInsight(item.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button onClick={generateInsights} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isLoading ? "Analyzing..." : "Generate Insights"}
            </Button>
          </div>
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
            {history.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                {history.length} historical insights saved
              </p>
            )}
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

            {/* Health Score Trend Chart */}
            <HealthScoreTrendChart history={history} />

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

        {/* Compare Dialog */}
        <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Compare Insights</DialogTitle>
              <DialogDescription>
                Compare historical insight with the current view
              </DialogDescription>
            </DialogHeader>
            {selectedForCompare && insights && (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-center">
                    {format(new Date(selectedForCompare.created_at), "MMM d, yyyy")}
                  </h4>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-4xl font-bold">{selectedForCompare.pipeline_health_score}</div>
                        <div className="text-sm text-muted-foreground">Health Score</div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div>Deals: {selectedForCompare.active_deals}</div>
                        <div>Value: {formatCurrency(Number(selectedForCompare.total_value))}</div>
                        <div>Risks: {selectedForCompare.risk_alerts?.length || 0}</div>
                        <div>Opps: {selectedForCompare.opportunities?.length || 0}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-4">
                  <h4 className="font-semibold text-center">Current</h4>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-4xl font-bold">
                          {insights.pipelineHealth.score}
                          <span className={`text-sm ml-2 ${getScoreChange(insights.pipelineHealth.score, selectedForCompare.pipeline_health_score).color}`}>
                            ({getScoreChange(insights.pipelineHealth.score, selectedForCompare.pipeline_health_score).text})
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">Health Score</div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div>Deals: {insights.pipelineHealth.metrics.activeDeals}</div>
                        <div>Value: {formatCurrency(insights.pipelineHealth.metrics.totalValue)}</div>
                        <div>Risks: {insights.riskAlerts.length}</div>
                        <div>Opps: {insights.opportunities.length}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            {selectedForCompare && !insights && (
              <p className="text-center text-muted-foreground py-8">
                Generate new insights first to compare with historical data.
              </p>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </>
  );
}
