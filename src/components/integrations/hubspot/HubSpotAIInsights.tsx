import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  useHubSpotDeals, 
  useHubSpotContacts, 
  useHubSpotTasks,
  useHubSpotMeetings,
  useHubSpotEmails,
  HubSpotDeal 
} from "@/hooks/useHubSpot";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Zap,
  Calendar,
  Mail,
  Phone,
  MessageSquare
} from "lucide-react";
import { formatDistanceToNow, differenceInDays, subDays } from "date-fns";

interface DealInsight {
  dealId: string;
  dealName: string;
  amount: number;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  insights: string[];
  recommendations: string[];
  lastActivity: Date | null;
  daysInStage: number;
}

export function HubSpotAIInsights() {
  const { data: dealsData, isLoading: dealsLoading } = useHubSpotDeals();
  const { data: contactsData } = useHubSpotContacts();
  const { data: tasksData } = useHubSpotTasks();
  const { data: meetingsData } = useHubSpotMeetings();
  const { data: emailsData } = useHubSpotEmails();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("scoring");

  // AI-powered deal scoring and insights
  const dealInsights = useMemo<DealInsight[]>(() => {
    if (!dealsData?.results) return [];

    return dealsData.results
      .filter(d => d.properties.hs_is_closed !== 'true')
      .map((deal) => {
        const amount = parseFloat(deal.properties.amount || '0');
        const createDate = deal.properties.createdate ? new Date(deal.properties.createdate) : new Date();
        const lastModified = deal.properties.hs_lastmodifieddate ? new Date(deal.properties.hs_lastmodifieddate) : createDate;
        const daysInStage = differenceInDays(new Date(), lastModified);
        const totalDays = differenceInDays(new Date(), createDate);
        
        // Calculate engagement score
        let engagementScore = 50;
        const insights: string[] = [];
        const recommendations: string[] = [];
        
        // Check for associated contacts
        const numContacts = parseInt(deal.properties.num_associated_contacts || '0');
        if (numContacts > 2) {
          engagementScore += 10;
          insights.push(`${numContacts} contacts engaged`);
        } else if (numContacts === 0) {
          engagementScore -= 15;
          insights.push('No contacts associated');
          recommendations.push('Add key stakeholders to this deal');
        }

        // Check for notes/activity
        const numNotes = parseInt(deal.properties.num_notes || '0');
        if (numNotes > 5) {
          engagementScore += 10;
          insights.push(`${numNotes} notes recorded`);
        } else if (numNotes < 2) {
          engagementScore -= 10;
          recommendations.push('Add more notes to track progress');
        }

        // Check stage progression
        if (daysInStage > 30) {
          engagementScore -= 20;
          insights.push(`Stale: ${daysInStage} days in current stage`);
          recommendations.push('Review deal progress and update stage');
        } else if (daysInStage > 14) {
          engagementScore -= 10;
          insights.push(`${daysInStage} days since last update`);
        }

        // Check close date
        const closeDate = deal.properties.closedate ? new Date(deal.properties.closedate) : null;
        if (closeDate) {
          const daysToClose = differenceInDays(closeDate, new Date());
          if (daysToClose < 0) {
            engagementScore -= 20;
            insights.push('Close date has passed');
            recommendations.push('Update close date or close the deal');
          } else if (daysToClose < 7) {
            insights.push(`Closing in ${daysToClose} days`);
            recommendations.push('Ensure all blockers are resolved');
          }
        }

        // Check deal probability
        const probability = parseFloat(deal.properties.hs_deal_stage_probability || '0');
        if (probability > 70) {
          engagementScore += 15;
          insights.push(`High probability: ${probability}%`);
        }

        // Amount-based scoring
        if (amount > 100000) {
          insights.push('High-value deal');
        }

        // Determine risk level
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (engagementScore < 40) {
          riskLevel = 'high';
        } else if (engagementScore < 60) {
          riskLevel = 'medium';
        }

        // Default recommendations
        if (recommendations.length === 0) {
          recommendations.push('Schedule a follow-up meeting');
          recommendations.push('Check on next steps with stakeholders');
        }

        return {
          dealId: deal.id,
          dealName: deal.properties.dealname || 'Unnamed Deal',
          amount,
          score: Math.max(0, Math.min(100, engagementScore)),
          riskLevel,
          insights,
          recommendations,
          lastActivity: lastModified,
          daysInStage,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [dealsData]);

  // Stale deals detection
  const staleDeals = useMemo(() => {
    return dealInsights.filter(d => d.daysInStage > 14);
  }, [dealInsights]);

  // High-risk deals
  const highRiskDeals = useMemo(() => {
    return dealInsights.filter(d => d.riskLevel === 'high');
  }, [dealInsights]);

  // Top opportunities
  const topOpportunities = useMemo(() => {
    return dealInsights
      .filter(d => d.score >= 60)
      .slice(0, 5);
  }, [dealInsights]);

  // Activity summary
  const activitySummary = useMemo(() => {
    const now = new Date();
    const weekAgo = subDays(now, 7);
    
    return {
      totalTasks: tasksData?.results?.length || 0,
      openTasks: tasksData?.results?.filter(t => t.properties.hs_task_status !== 'COMPLETED').length || 0,
      recentMeetings: meetingsData?.results?.filter(m => {
        const meetingTime = m.properties.hs_meeting_start_time;
        if (!meetingTime) return false;
        return new Date(meetingTime) > weekAgo;
      }).length || 0,
      recentEmails: emailsData?.results?.filter(e => {
        const emailTime = e.properties.hs_timestamp;
        if (!emailTime) return false;
        return new Date(emailTime) > weekAgo;
      }).length || 0,
    };
  }, [tasksData, meetingsData, emailsData]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRiskBadge = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Low Risk</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Medium Risk</Badge>;
      case 'high':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">High Risk</Badge>;
    }
  };

  if (dealsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/20">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {Math.round(dealInsights.reduce((sum, d) => sum + d.score, 0) / (dealInsights.length || 1))}
                </p>
                <p className="text-sm text-muted-foreground">Avg. Deal Score</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{highRiskDeals.length}</p>
                <p className="text-sm text-muted-foreground">At-Risk Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{staleDeals.length}</p>
                <p className="text-sm text-muted-foreground">Stale Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Target className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{topOpportunities.length}</p>
                <p className="text-sm text-muted-foreground">Hot Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{activitySummary.openTasks} open</p>
                <p className="text-xs text-muted-foreground">of {activitySummary.totalTasks} tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{activitySummary.recentMeetings} meetings</p>
                <p className="text-xs text-muted-foreground">this week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{activitySummary.recentEmails} emails</p>
                <p className="text-xs text-muted-foreground">this week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{contactsData?.results?.length || 0}</p>
                <p className="text-xs text-muted-foreground">total contacts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scoring" className="gap-2">
            <Target className="h-4 w-4" />
            Deal Scoring
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            At-Risk ({highRiskDeals.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scoring" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deal Health Scores</CardTitle>
              <CardDescription>AI-powered scoring based on engagement and activity</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {dealInsights.map((deal) => (
                    <div key={deal.dealId} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium truncate">{deal.dealName}</p>
                          {getRiskBadge(deal.riskLevel)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(deal.amount)} • {deal.daysInStage} days in stage
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {deal.insights.slice(0, 3).map((insight, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {insight}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="w-32 text-right">
                        <p className={`text-2xl font-bold ${getScoreColor(deal.score)}`}>
                          {deal.score}
                        </p>
                        <Progress 
                          value={deal.score} 
                          className="h-2 mt-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">At-Risk Deals</CardTitle>
              <CardDescription>Deals requiring immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              {highRiskDeals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">No high-risk deals!</p>
                  <p className="text-sm">All deals are in good health.</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {highRiskDeals.map((deal) => (
                      <div key={deal.dealId} className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{deal.dealName}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(deal.amount)}
                            </p>
                          </div>
                          <Badge variant="destructive">Score: {deal.score}</Badge>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-red-600">Issues:</p>
                          <ul className="text-sm space-y-1">
                            {deal.insights.map((insight, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                {insight}
                              </li>
                            ))}
                          </ul>
                          <p className="text-sm font-medium text-green-600 mt-3">Recommendations:</p>
                          <ul className="text-sm space-y-1">
                            {deal.recommendations.map((rec, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <Lightbulb className="h-3 w-3 text-green-500" />
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  Top Opportunities
                </CardTitle>
                <CardDescription>Hot leads likely to close</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topOpportunities.map((deal) => (
                    <div key={deal.dealId} className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div>
                        <p className="font-medium">{deal.dealName}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(deal.amount)}</p>
                      </div>
                      <Badge className="bg-green-500/10 text-green-600">{deal.score} pts</Badge>
                    </div>
                  ))}
                  {topOpportunities.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No hot leads yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  Suggested Actions
                </CardTitle>
                <CardDescription>AI-recommended next steps</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {staleDeals.slice(0, 3).map((deal) => (
                    <div key={deal.dealId} className="p-3 rounded-lg bg-muted/50">
                      <p className="font-medium text-sm">{deal.dealName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {deal.recommendations[0]}
                      </p>
                      <Button variant="link" size="sm" className="p-0 h-auto mt-1">
                        Take action <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  ))}
                  {staleDeals.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No immediate actions needed</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}