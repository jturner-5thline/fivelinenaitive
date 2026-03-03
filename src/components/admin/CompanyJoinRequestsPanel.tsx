import { useState } from "react";
import {
  useCompanyJoinRequests,
  useApproveJoinRequest,
  useRejectJoinRequest,
  JoinRequest,
} from "@/hooks/useCompanyJoinRequests";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Check, X, Clock, Building2, Mail, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function CompanyJoinRequestsPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  const [rejectionNote, setRejectionNote] = useState("");

  // Get user's company
  const { data: companyMembership } = useQuery({
    queryKey: ["my-company-membership", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("company_members")
        .select("company_id, role, companies:company_id(name)")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const companyId = companyMembership?.company_id || null;
  const { data: requests, isLoading } = useCompanyJoinRequests(companyId, activeTab === "all" ? "all" : activeTab);
  const approveRequest = useApproveJoinRequest();
  const rejectRequest = useRejectJoinRequest();

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  if (!companyMembership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Company Join Requests
          </CardTitle>
          <CardDescription>You need to be a company admin to manage join requests</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Company Join Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingCount = requests?.filter((r) => r.status === "pending").length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Company Join Requests
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {pendingCount}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Manage requests from users wanting to join{" "}
          {(companyMembership.companies as any)?.name || "your company"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {!requests || requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No {activeTab} join requests</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Requested</TableHead>
                    {activeTab === "pending" && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                    {activeTab !== "pending" && <TableHead>Decision</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={request.user_avatar_url || undefined} />
                            <AvatarFallback>
                              {getInitials(request.user_display_name, request.user_email)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {request.user_display_name || request.user_email.split("@")[0]}
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {request.user_email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {request.note || "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(request.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </TableCell>
                      {activeTab === "pending" ? (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                approveRequest.mutate({ requestId: request.id })
                              }
                              disabled={approveRequest.isPending}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reject Join Request?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will reject the request from{" "}
                                    <strong>{request.user_email}</strong>. They will be
                                    notified.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="px-6 pb-4">
                                  <Textarea
                                    placeholder="Reason for rejection (optional)"
                                    value={rejectionNote}
                                    onChange={(e) => setRejectionNote(e.target.value)}
                                    rows={3}
                                  />
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setRejectionNote("")}>
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      rejectRequest.mutate({
                                        requestId: request.id,
                                        rejectionNote: rejectionNote || undefined,
                                      });
                                      setRejectionNote("");
                                    }}
                                  >
                                    Reject Request
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      ) : (
                        <TableCell>
                          <div className="space-y-1">
                            <Badge
                              variant={request.status === "approved" ? "default" : "destructive"}
                            >
                              {request.status}
                            </Badge>
                            {request.decided_by_name && (
                              <p className="text-xs text-muted-foreground">
                                by {request.decided_by_name}
                              </p>
                            )}
                            {request.rejection_note && (
                              <p className="text-xs text-muted-foreground italic">
                                "{request.rejection_note}"
                              </p>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
