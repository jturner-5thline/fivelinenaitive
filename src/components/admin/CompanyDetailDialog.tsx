import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Building2, Users, Activity, TrendingUp, Ban, CheckCircle,
  DollarSign, Briefcase, Clock, AlertTriangle
} from "lucide-react";
import { useCompanyMembers, useCompanyStats, useCompanyActivity, useToggleCompanySuspension } from "@/hooks/useAdminData";

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  industry: string | null;
  employee_size: string | null;
  created_at: string;
  member_count: number;
  suspended_at: string | null;
  suspended_reason: string | null;
}

interface CompanyDetailDialogProps {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CompanyDetailDialog = ({ company, open, onOpenChange }: CompanyDetailDialogProps) => {
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  
  const { data: members, isLoading: membersLoading } = useCompanyMembers(company?.id || null);
  const { data: stats, isLoading: statsLoading } = useCompanyStats(company?.id || null);
  const { data: activity, isLoading: activityLoading } = useCompanyActivity(company?.id || null);
  const toggleSuspension = useToggleCompanySuspension();

  if (!company) return null;

  const isSuspended = !!company.suspended_at;

  const handleSuspend = () => {
    toggleSuspension.mutate(
      { companyId: company.id, suspend: true, reason: suspendReason },
      {
        onSuccess: () => {
          setShowSuspendConfirm(false);
          setSuspendReason("");
        },
      }
    );
  };

  const handleUnsuspend = () => {
    toggleSuspension.mutate({ companyId: company.id, suspend: false });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={company.logo_url || undefined} />
              <AvatarFallback className="text-lg">{company.name?.[0] || "C"}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {company.name}
                {isSuspended && (
                  <Badge variant="destructive" className="ml-2">
                    <Ban className="h-3 w-3 mr-1" />
                    Suspended
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {company.industry || "No industry"} • {company.employee_size || "Unknown size"} • Created {format(new Date(company.created_at), "MMM d, yyyy")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isSuspended && company.suspended_reason && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Suspension Reason</p>
              <p className="text-sm text-muted-foreground">{company.suspended_reason}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="stats" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stats" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              Members
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="stats" className="m-0">
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Total Deals
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{stats?.total_deals || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Active Deals
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{stats?.active_deals || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Total Lenders
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{stats?.total_lenders || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Total Deal Value
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{formatCurrency(stats?.total_deal_value || 0)}</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="members" className="m-0">
              {membersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : members?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No members found</p>
              ) : (
                <div className="space-y-3">
                  {members?.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.avatar_url} />
                          <AvatarFallback>{member.display_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.display_name || "No name"}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="m-0">
              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : activity?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity found</p>
              ) : (
                <div className="space-y-2">
                  {activity?.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{item.user_name || "System"}</span>
                          {" "}
                          <span className="text-muted-foreground">{item.description}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.deal_name} • {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="border-t pt-4">
          {showSuspendConfirm ? (
            <div className="flex-1 space-y-3">
              <Textarea
                placeholder="Reason for suspension (optional)..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="resize-none"
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowSuspendConfirm(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleSuspend}
                  disabled={toggleSuspension.isPending}
                >
                  {toggleSuspension.isPending ? "Suspending..." : "Confirm Suspension"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {isSuspended ? (
                <Button 
                  variant="default" 
                  onClick={handleUnsuspend}
                  disabled={toggleSuspension.isPending}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {toggleSuspension.isPending ? "Unsuspending..." : "Unsuspend Company"}
                </Button>
              ) : (
                <Button 
                  variant="destructive" 
                  onClick={() => setShowSuspendConfirm(true)}
                  className="gap-2"
                >
                  <Ban className="h-4 w-4" />
                  Suspend Company
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};