import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Monitor, Smartphone, Tablet, ChevronDown, ChevronUp, Copy, Check, BarChart3 } from "lucide-react";
import { useDeviceMetrics } from "@/hooks/useUXAnalytics";
import { generateDeviceRecommendations } from "@/utils/insightRecommendations";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function DevicesTab() {
  const { data: devices, isLoading } = useDeviceMetrics();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const deviceRecommendations = devices ? generateDeviceRecommendations(devices) : [];

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case "desktop":
        return <Monitor className="h-5 w-5" />;
      case "mobile":
        return <Smartphone className="h-5 w-5" />;
      case "tablet":
        return <Tablet className="h-5 w-5" />;
      default:
        return <Monitor className="h-5 w-5" />;
    }
  };

  const getRatingBadge = (value: number, thresholds: { good: number; poor: number }) => {
    if (value <= thresholds.good) {
      return <Badge className="bg-green-500">Good</Badge>;
    } else if (value <= thresholds.poor) {
      return <Badge className="bg-yellow-500 text-black">Needs Improvement</Badge>;
    }
    return <Badge className="bg-red-500">Poor</Badge>;
  };

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

  const chartData = devices?.map((d) => ({
    name: d.device_type.charAt(0).toUpperCase() + d.device_type.slice(1),
    LCP: Math.round(d.lcp_avg),
    FID: Math.round(d.fid_avg),
    CLS: d.cls_avg * 1000, // Scale up for visibility
  })) || [];

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading device metrics...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {devices?.map((device) => (
          <Card key={device.device_type}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {getDeviceIcon(device.device_type)}
                <CardTitle className="text-lg capitalize">{device.device_type}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sessions</span>
                <span className="font-medium">{device.session_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Page Views</span>
                <span className="font-medium">{device.avg_page_views.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bounce Rate</span>
                <span className="font-medium">{device.bounce_rate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Error Rate</span>
                <span className="font-medium">{device.error_rate.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Core Web Vitals Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Core Web Vitals Comparison
          </CardTitle>
          <CardDescription>Performance metrics across device types (LCP/FID in ms, CLS scaled x1000)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar dataKey="LCP" fill="hsl(var(--primary))" name="LCP (ms)" />
                <Bar dataKey="FID" fill="hsl(var(--chart-2))" name="FID (ms)" />
                <Bar dataKey="CLS" fill="hsl(var(--chart-3))" name="CLS (x1000)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Core Web Vitals Detailed Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Core Web Vitals by Device</CardTitle>
          <CardDescription>Detailed performance metrics with ratings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["LCP", "FID", "CLS"].map((metric) => (
              <div key={metric} className="space-y-2">
                <p className="text-sm font-medium">
                  {metric === "LCP" && "Largest Contentful Paint (LCP)"}
                  {metric === "FID" && "First Input Delay (FID)"}
                  {metric === "CLS" && "Cumulative Layout Shift (CLS)"}
                </p>
                <div className="grid gap-2 md:grid-cols-3">
                  {devices?.map((device) => {
                    const value =
                      metric === "LCP"
                        ? device.lcp_avg
                        : metric === "FID"
                        ? device.fid_avg
                        : device.cls_avg;
                    const thresholds =
                      metric === "LCP"
                        ? { good: 2500, poor: 4000 }
                        : metric === "FID"
                        ? { good: 100, poor: 300 }
                        : { good: 0.1, poor: 0.25 };

                    return (
                      <div
                        key={device.device_type}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          {getDeviceIcon(device.device_type)}
                          <span className="text-sm capitalize">{device.device_type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {metric === "CLS" ? value.toFixed(3) : `${value.toFixed(0)}ms`}
                          </span>
                          {getRatingBadge(value, thresholds)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Engagement Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Engagement Metrics Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-center">Desktop</TableHead>
                <TableHead className="text-center">Mobile</TableHead>
                <TableHead className="text-center">Tablet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Bounce Rate</TableCell>
                {devices?.map((d) => (
                  <TableCell key={d.device_type} className="text-center">
                    {d.bounce_rate.toFixed(1)}%
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>Pages per Session</TableCell>
                {devices?.map((d) => (
                  <TableCell key={d.device_type} className="text-center">
                    {d.avg_page_views.toFixed(1)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>Error Rate</TableCell>
                {devices?.map((d) => (
                  <TableCell key={d.device_type} className="text-center">
                    {d.error_rate.toFixed(1)}%
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Device-Specific Recommendations */}
      {deviceRecommendations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Device-Specific Recommendations</h3>
          {deviceRecommendations.map((rec) => (
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
                      <Badge variant="outline">
                        {rec.id.includes("mobile") && <Smartphone className="h-3 w-3 mr-1" />}
                        {rec.id.includes("tablet") && <Tablet className="h-3 w-3 mr-1" />}
                        {rec.id.includes("desktop") && <Monitor className="h-3 w-3 mr-1" />}
                        {rec.category}
                      </Badge>
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
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Current: {rec.current_value.toFixed(1)}</span>
                      <span>Target: {rec.target_value.toFixed(1)}</span>
                    </div>
                    <Progress 
                      value={Math.max(0, Math.min(100, (1 - rec.current_value / (rec.target_value || 1)) * 100))} 
                      className="h-2" 
                    />
                  </div>

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
