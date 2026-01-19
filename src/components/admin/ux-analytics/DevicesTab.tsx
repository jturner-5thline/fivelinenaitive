import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useDeviceMetrics } from "@/hooks/useUXAnalytics";

export function DevicesTab() {
  const { data: devices, isLoading } = useDeviceMetrics();

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

      {/* Core Web Vitals Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Core Web Vitals by Device</CardTitle>
          <CardDescription>Performance metrics comparison across device types</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["LCP", "FID", "CLS"].map((metric) => (
              <div key={metric} className="space-y-2">
                <p className="text-sm font-medium">{metric}</p>
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
    </div>
  );
}
