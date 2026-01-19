import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Search, Bug, Accessibility, MessageSquare, TrendingDown } from "lucide-react";
import {
  useClientErrors,
  useSearchEvents,
  useAccessibilityIssues,
  useUserFeedback,
  useNavigationEvents,
} from "@/hooks/useUXAnalytics";

export function AdvancedAnalyticsTab() {
  const { data: errors } = useClientErrors();
  const { data: searchData } = useSearchEvents();
  const { data: accessibility } = useAccessibilityIssues();
  const { data: feedback } = useUserFeedback();
  const { data: navigation } = useNavigationEvents();

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge className="bg-red-500">Critical</Badge>;
      case "serious":
        return <Badge className="bg-orange-500">Serious</Badge>;
      case "moderate":
        return <Badge className="bg-yellow-500 text-black">Moderate</Badge>;
      case "minor":
        return <Badge className="bg-blue-500">Minor</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{errors?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Error Types</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{searchData?.failed || 0}</p>
                <p className="text-sm text-muted-foreground">Failed Searches</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Accessibility className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {accessibility?.filter((a) => !a.is_resolved).length || 0}
                </p>
                <p className="text-sm text-muted-foreground">A11y Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{feedback?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Feedback Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Client Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Client Errors
            </CardTitle>
            <CardDescription>JavaScript errors detected in the application</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {!errors || errors.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No errors recorded</p>
              ) : (
                <div className="space-y-3">
                  {errors.slice(0, 10).map((error, index) => (
                    <div key={index} className="p-3 rounded border bg-red-500/5 border-red-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline">{error.error_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {error.occurrence_count}x
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{error.error_message}</p>
                      <p className="text-xs text-muted-foreground">{error.page_path}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Failed Searches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              Failed Searches
            </CardTitle>
            <CardDescription>Search queries that returned no results</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {!searchData?.failedQueries || searchData.failedQueries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No failed searches</p>
              ) : (
                <div className="space-y-2">
                  {searchData.failedQueries.map((search, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded bg-muted/50"
                    >
                      <span className="text-sm font-medium">"{search.query}"</span>
                      <span className="text-xs text-muted-foreground">{search.page_path}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Accessibility Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Accessibility className="h-5 w-5" />
              Accessibility Issues
            </CardTitle>
            <CardDescription>WCAG compliance issues detected</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {!accessibility || accessibility.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No accessibility issues detected
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessibility.slice(0, 10).map((issue, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{issue.issue_type}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-xs">
                              {issue.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getSeverityBadge(issue.severity)}</TableCell>
                        <TableCell>
                          {issue.is_resolved ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500">
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-500">
                              Open
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* User Feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              User Feedback
            </CardTitle>
            <CardDescription>Direct feedback from users</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {!feedback || feedback.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No feedback collected yet</p>
              ) : (
                <div className="space-y-3">
                  {feedback.slice(0, 10).map((item, index) => (
                    <div key={index} className="p-3 rounded border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span
                              key={star}
                              className={
                                star <= (item.rating || 0) ? "text-yellow-500" : "text-muted"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </div>
                        <Badge variant="outline">{item.category}</Badge>
                      </div>
                      <p className="text-sm">{item.comment}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.page_path}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Exit Pages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Top Exit Pages
          </CardTitle>
          <CardDescription>Pages where users most frequently leave the application</CardDescription>
        </CardHeader>
        <CardContent>
          {!navigation || navigation.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No navigation data yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Exit Count</TableHead>
                  <TableHead className="text-right">Bounce Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const exitPages = new Map<string, { exits: number; bounces: number; total: number }>();
                  navigation.forEach((nav) => {
                    if (nav.is_exit) {
                      const existing = exitPages.get(nav.from_path || nav.to_path) || {
                        exits: 0,
                        bounces: 0,
                        total: 0,
                      };
                      existing.exits++;
                      existing.total++;
                      if (nav.is_bounce) existing.bounces++;
                      exitPages.set(nav.from_path || nav.to_path, existing);
                    }
                  });

                  return Array.from(exitPages.entries())
                    .sort((a, b) => b[1].exits - a[1].exits)
                    .slice(0, 10)
                    .map(([path, stats]) => (
                      <TableRow key={path}>
                        <TableCell className="font-medium">{path}</TableCell>
                        <TableCell className="text-right">{stats.exits}</TableCell>
                        <TableCell className="text-right">
                          {((stats.bounces / stats.total) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ));
                })()}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
