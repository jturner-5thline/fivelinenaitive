import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Cloud, Users, Building2, Briefcase, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { 
  useExternalProfiles, 
  useExternalDeals, 
  useExternalDealLenders, 
  useExternalActivityLogs,
  useExternalDataSummary 
} from "@/hooks/useExternalData";
import { formatCurrencyInputValue } from "@/utils/currencyFormat";

export const ExternalDataTab = () => {
  const [activeTab, setActiveTab] = useState("profiles");
  
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useExternalDataSummary();
  const { data: profiles, isLoading: profilesLoading, refetch: refetchProfiles } = useExternalProfiles();
  const { data: deals, isLoading: dealsLoading, refetch: refetchDeals } = useExternalDeals();
  const { data: lenders, isLoading: lendersLoading, refetch: refetchLenders } = useExternalDealLenders();
  const { data: activities, isLoading: activitiesLoading, refetch: refetchActivities } = useExternalActivityLogs();

  const handleRefreshAll = () => {
    refetchSummary();
    refetchProfiles();
    refetchDeals();
    refetchLenders();
    refetchActivities();
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">External Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.profiles ?? 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">External Deals</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.deals ?? 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">External Lenders</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.lenders ?? 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Activity Logs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.activities ?? 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Tabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>External Project Data</CardTitle>
                <CardDescription>Real-time synced data from connected projects</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profiles" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="deals" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Deals
              </TabsTrigger>
              <TabsTrigger value="lenders" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Lenders
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profiles" className="mt-4">
              <ScrollArea className="h-[400px]">
                {profilesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : profiles?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No external users synced yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Source Project</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles?.map((profile) => (
                        <TableRow key={profile.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={profile.avatar_url ?? undefined} />
                                <AvatarFallback>{getInitials(profile.display_name)}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{profile.display_name || "Unknown"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{profile.email || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {profile.source_project_id.slice(0, 8)}...
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(profile.synced_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="deals" className="mt-4">
              <ScrollArea className="h-[400px]">
                {dealsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : deals?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No external deals synced yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deals?.map((deal) => (
                        <TableRow key={deal.id}>
                          <TableCell className="font-medium">{deal.company || "Unknown"}</TableCell>
                          <TableCell>${deal.value ? formatCurrencyInputValue(deal.value) : "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{deal.stage || "Unknown"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={deal.status === "active" ? "default" : "outline"}
                            >
                              {deal.status || "Unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(deal.synced_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="lenders" className="mt-4">
              <ScrollArea className="h-[400px]">
                {lendersLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : lenders?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No external lenders synced yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lender Name</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Substage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lenders?.map((lender) => (
                        <TableRow key={lender.id}>
                          <TableCell className="font-medium">{lender.name || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{lender.stage || "Unknown"}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {lender.substage || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{lender.status || "Unknown"}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(lender.synced_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <ScrollArea className="h-[400px]">
                {activitiesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : activities?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No external activity synced yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities?.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell>
                            <Badge variant="outline">{activity.activity_type || "Unknown"}</Badge>
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {activity.description || "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {activity.external_created_at 
                              ? format(new Date(activity.external_created_at), "MMM d, yyyy HH:mm")
                              : "-"
                            }
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(activity.synced_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
