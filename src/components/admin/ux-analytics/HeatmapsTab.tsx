import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, MousePointer, Eye, Clock, ArrowLeft, ChevronDown, ChevronUp, Copy, Check, Lightbulb } from "lucide-react";
import { useClickHeatmap, useRageClicks, usePageViews, useNavigationEvents } from "@/hooks/useUXAnalytics";
import { generateHeatmapInsights, convertHeatmapInsightToRecommendation } from "@/utils/insightRecommendations";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function HeatmapsTab() {
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const { data: heatmapData } = useClickHeatmap(selectedPage || undefined);
  const { data: rageClicks } = useRageClicks();
  const { data: pageViews } = usePageViews();
  const { data: navigation } = useNavigationEvents();

  // Aggregate pages with click data
  const pageStats = new Map<string, { clicks: number; sessions: number; hasRageClicks: boolean }>();
  
  heatmapData?.forEach((item) => {
    const existing = pageStats.get(item.page_path) || { clicks: 0, sessions: 0, hasRageClicks: false };
    existing.clicks += item.click_count;
    pageStats.set(item.page_path, existing);
  });

  pageViews?.forEach((pv) => {
    const existing = pageStats.get(pv.page_path) || { clicks: 0, sessions: 0, hasRageClicks: false };
    existing.sessions = pv.unique_sessions || 1;
    pageStats.set(pv.page_path, existing);
  });

  rageClicks?.forEach((rc) => {
    const existing = pageStats.get(rc.page_path);
    if (existing) existing.hasRageClicks = true;
  });

  const pages = Array.from(pageStats.entries()).map(([path, stats]) => ({
    path,
    ...stats,
  }));

  const pageRageClicks = rageClicks?.filter((rc) => rc.page_path === selectedPage) || [];
  const pageHeatmap = heatmapData?.filter((h) => h.page_path === selectedPage) || [];
  const maxClicks = Math.max(...pageHeatmap.map((h) => h.click_count), 1);

  const totalClicks = heatmapData?.reduce((sum, h) => sum + h.click_count, 0) || 0;
  const totalRageClicks = rageClicks?.length || 0;
  const pagesTracked = pages.length;

  // Generate engagement data for insights
  const engagementData = navigation?.reduce((acc, nav) => {
    const key = nav.from_path || nav.to_path;
    if (!acc.find((e) => e.page_path === key)) {
      const pageNavs = navigation?.filter((n) => n.from_path === key || n.to_path === key) || [];
      acc.push({
        page_path: key,
        scroll_depth: pageNavs.reduce((sum, n) => sum + (n.scroll_depth_percent || 0), 0) / (pageNavs.length || 1),
        time_on_page: pageNavs.reduce((sum, n) => sum + (n.time_on_previous_page_ms || 0), 0) / (pageNavs.length || 1),
      });
    }
    return acc;
  }, [] as { page_path: string; scroll_depth: number; time_on_page: number }[]) || [];

  // Generate heatmap insights
  const heatmapInsights = generateHeatmapInsights(heatmapData || [], engagementData);
  const heatmapRecommendations = heatmapInsights.map(convertHeatmapInsightToRecommendation);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-500 hover:bg-red-600";
      case "high":
        return "bg-orange-500 hover:bg-orange-600";
      case "medium":
        return "bg-yellow-500 hover:bg-yellow-600 text-black";
      case "low":
        return "bg-blue-500 hover:bg-blue-600";
      default:
        return "bg-gray-500";
    }
  };

  const handleCopyPrompt = async (id: string, prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    toast({ title: "Prompt copied!", description: "Paste it into Lovable to implement the fix." });
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (selectedPage) {
    const pageEngagement = engagementData.find((e) => e.page_path === selectedPage);
    
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedPage(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Pages
        </Button>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">
                    {pageViews?.find((p) => p.page_path === selectedPage)?.view_count || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Page Views</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <MousePointer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">
                    {pageHeatmap.reduce((sum, h) => sum + h.click_count, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Clicks</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{pageRageClicks.length}</p>
                  <p className="text-sm text-muted-foreground">Rage Click Hotspots</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">
                    {pageEngagement ? `${(pageEngagement.scroll_depth).toFixed(0)}%` : 'N/A'}
                  </p>
                  <p className="text-sm text-muted-foreground">Avg Scroll Depth</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Click Heatmap - {selectedPage}</CardTitle>
            <CardDescription>Top clicked elements on this page</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pageHeatmap.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No click data for this page yet</p>
            ) : (
              pageHeatmap.slice(0, 15).map((item, index) => {
                const isRageClick = pageRageClicks.some(
                  (rc) => rc.element_selector === item.element_selector
                );
                const widthPercent = (item.click_count / maxClicks) * 100;
                const clickPercent = (item.click_count / pageHeatmap.reduce((sum, h) => sum + h.click_count, 0) * 100).toFixed(1);

                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {isRageClick && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium truncate max-w-xs">
                          {item.element_text || item.element_selector}
                        </span>
                      </div>
                      <span className="text-muted-foreground">{item.click_count} clicks ({clickPercent}%)</span>
                    </div>
                    <div className="relative h-4">
                      <div
                        className={cn(
                          "h-full rounded transition-all",
                          isRageClick ? "bg-red-500" : "bg-primary"
                        )}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {pageRageClicks.length > 0 && (
          <Card className="border-red-500/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Rage Click Hotspots
              </CardTitle>
              <CardDescription>
                Elements causing user frustration (multiple rapid clicks)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pageRageClicks.map((rc, index) => (
                  <div key={index} className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <p className="font-medium">{rc.element_text || rc.element_selector}</p>
                    <p className="text-sm text-muted-foreground">
                      {rc.click_count} rage clicks on {rc.device_type || "unknown"} device
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{pagesTracked}</p>
            <p className="text-sm text-muted-foreground">Pages Tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Total Clicks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-red-500">{totalRageClicks}</p>
            <p className="text-sm text-muted-foreground">Rage Click Hotspots</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">
              {pages.length > 0 ? (totalClicks / pages.length).toFixed(0) : 0}
            </p>
            <p className="text-sm text-muted-foreground">Avg Clicks/Page</p>
          </CardContent>
        </Card>
      </div>

      {/* Page List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pages with Click Data</CardTitle>
          <CardDescription>Click on a page to view its heatmap</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {pages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No click data collected yet. Data will appear as users interact with the app.
              </p>
            ) : (
              <div className="space-y-2">
                {pages.map((page) => (
                  <div
                    key={page.path}
                    className="flex items-center justify-between p-3 rounded border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedPage(page.path)}
                  >
                    <div className="flex items-center gap-2">
                      {page.hasRageClicks && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{page.path}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{page.clicks} clicks</span>
                      <span>{page.sessions} sessions</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Heatmap-Based Recommendations */}
      {heatmapRecommendations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Heatmap-Based Recommendations
          </h3>
          {heatmapRecommendations.map((rec) => (
            <Collapsible
              key={rec.id}
              open={expandedId === rec.id}
              onOpenChange={(open) => setExpandedId(open ? rec.id : null)}
            >
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("text-white", getPriorityColor(rec.priority))}>
                        {rec.priority}
                      </Badge>
                      <Badge variant="outline">{rec.category}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPrompt(rec.id, rec.prompt);
                      }}
                    >
                      {copiedId === rec.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <CardTitle className="text-base mt-2">{rec.title}</CardTitle>
                  <CardDescription>{rec.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{rec.reasoning}</p>

                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full">
                      {expandedId === rec.id ? (
                        <>
                          <ChevronUp className="mr-2 h-4 w-4" />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-2 h-4 w-4" />
                          Show Action Items
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-2">Action Items</p>
                      <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                        {rec.action_items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium">Expected Impact</p>
                      <p className="text-sm text-muted-foreground">{rec.impact}</p>
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
