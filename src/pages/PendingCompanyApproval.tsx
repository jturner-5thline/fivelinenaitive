import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyJoinRequests } from "@/hooks/useCompanyJoinRequests";
import { useIsApproved } from "@/hooks/useUserApproval";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, LogOut, RefreshCw, Building2, CheckCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function PendingCompanyApproval() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isApproved, refetch: refetchApproval } = useIsApproved();
  const { data: joinRequests, refetch: refetchRequests, isLoading } = useMyJoinRequests();
  const [isSending, setIsSending] = useState(false);

  // Redirect if approved
  useEffect(() => {
    if (isApproved) {
      navigate("/onboarding", { replace: true });
    }
  }, [isApproved, navigate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleRefresh = async () => {
    setIsSending(true);
    try {
      // Re-send notifications for all pending join requests
      const pendingReqs = joinRequests?.filter((r: any) => r.status === "pending") || [];
      await Promise.all(
        pendingReqs.map((request: any) =>
          supabase.functions.invoke("notify-company-join-request", {
            body: {
              company_id: request.company_id,
              user_id: user?.id,
              user_email: user?.email,
              user_name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email,
              note: request.note,
            },
          }).catch(console.error)
        )
      );
      if (pendingReqs.length > 0) {
        toast.success("Company admins have been notified again");
      }
    } catch (e) {
      console.error("Error resending notification:", e);
    }
    refetchApproval();
    refetchRequests();
    setIsSending(false);
  };

  const pendingRequests = joinRequests?.filter((r: any) => r.status === "pending") || [];
  const approvedRequests = joinRequests?.filter((r: any) => r.status === "approved") || [];
  const rejectedRequests = joinRequests?.filter((r: any) => r.status === "rejected") || [];

  const latestPending = pendingRequests[0];
  const companyName = latestPending?.companies?.name || "your company";

  return (
    <>
      <Helmet>
        <title>Pending Company Approval | naitive</title>
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-2xl">Request Pending</CardTitle>
            <CardDescription className="text-base">
              Your request to join <strong>{companyName}</strong> is pending approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="font-medium">{user?.email}</p>
            </div>

            {/* Show request status */}
            {joinRequests && joinRequests.length > 0 && (
              <div className="space-y-3">
                {joinRequests.map((request: any) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{request.companies?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        request.status === "approved"
                          ? "default"
                          : request.status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {request.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                      {request.status === "approved" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {request.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                      {request.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {rejectedRequests.length > 0 && (
              <div className="bg-destructive/10 rounded-lg p-4 text-center">
                <p className="text-sm text-destructive">
                  Your request to join was not approved.
                  {rejectedRequests[0]?.rejection_note && (
                    <span className="block mt-1 text-muted-foreground">
                      "{rejectedRequests[0].rejection_note}"
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  If you believe this was a mistake, contact your company admin or support.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground text-center">
              We'll email you as soon as an admin reviews your request.
            </p>

            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={handleRefresh} disabled={isSending} className="w-full">
                <RefreshCw className={`w-4 h-4 mr-2 ${isSending ? 'animate-spin' : ''}`} />
                Check Status
              </Button>
              <Button variant="ghost" onClick={handleSignOut} className="w-full">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
