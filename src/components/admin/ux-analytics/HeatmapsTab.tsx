import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, MousePointer, Eye, Clock, ArrowLeft } from "lucide-react";
import { useClickHeatmap, useRageClicks, usePageViews } from "@/hooks/useUXAnalytics";
import { cn } from "@/lib/utils";

export function HeatmapsTab() {
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const { data: heatmapData } = useClickHeatmap(selectedPage || undefined);
  const { data: rageClicks } = useRageClicks();
  const { data: pageViews } = usePageViews();

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

  if (selectedPage) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedPage(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Pages
        </Button>

        <div className="grid gap-4 md:grid-cols-3">
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
                      <span className="text-muted-foreground">{item.click_count} clicks</span>
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
    </div>
  );
}
