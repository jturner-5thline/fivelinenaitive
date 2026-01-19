import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, GitBranch, Monitor, MousePointer, BarChart3, Lightbulb } from "lucide-react";
import { useUXRecommendations } from "@/hooks/useUXAnalytics";
import { HealthScoreCard } from "./HealthScoreCard";
import { InsightsGrid } from "./InsightsGrid";
import { RecommendationsList } from "./RecommendationsList";
import { FunnelVisualization } from "./FunnelVisualization";
import { DevicesTab } from "./DevicesTab";
import { HeatmapsTab } from "./HeatmapsTab";
import { AdvancedAnalyticsTab } from "./AdvancedAnalyticsTab";
import { InsightsTab } from "./InsightsTab";

export function UXRecommendationsPanel() {
  const {
    healthScore,
    insights,
    recommendations,
    userEngagementFunnel,
    dealEngagementFunnel,
    totalRecommendations,
  } = useUXRecommendations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">UX Recommendations</h1>
        <p className="text-muted-foreground">
          AI-powered insights and recommendations to improve user experience
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            <span className="hidden sm:inline">Insights</span>
          </TabsTrigger>
          <TabsTrigger value="funnels" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Funnels</span>
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Devices</span>
          </TabsTrigger>
          <TabsTrigger value="heatmaps" className="flex items-center gap-2">
            <MousePointer className="h-4 w-4" />
            <span className="hidden sm:inline">Heatmaps</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Advanced</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <HealthScoreCard score={healthScore} totalRecommendations={totalRecommendations} />
            <div className="lg:col-span-2">
              <InsightsGrid insights={insights} />
            </div>
          </div>
          <RecommendationsList recommendations={recommendations} />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsTab />
        </TabsContent>

        <TabsContent value="funnels" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <FunnelVisualization
              title="User Engagement Funnel"
              description="How users progress through engagement stages"
              steps={userEngagementFunnel}
            />
            <FunnelVisualization
              title="Deal Engagement Funnel"
              description="Conversion through deal interaction stages"
              steps={dealEngagementFunnel}
            />
          </div>
        </TabsContent>

        <TabsContent value="devices">
          <DevicesTab />
        </TabsContent>

        <TabsContent value="heatmaps">
          <HeatmapsTab />
        </TabsContent>

        <TabsContent value="advanced">
          <AdvancedAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
