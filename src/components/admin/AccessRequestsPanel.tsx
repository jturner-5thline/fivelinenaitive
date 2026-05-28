/**
 * Unified Access Requests pipeline (Phase 4 merge).
 *
 * Collapses four legacy admin surfaces into a single tabbed queue:
 *   - Pending Approvals  (new sign-ups awaiting admin approval)
 *   - Join Requests      (existing users requesting a workspace)
 *   - Invitations        (outstanding company invitations)
 *   - Waitlist           (external sign-ups waiting on capacity)
 *
 * Each tab still renders its original panel/table component, so behavior,
 * RLS scoping and mutations are unchanged. Live counts come from the
 * shared admin counts hook and only render when > 0.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck, Building2, Mail, ListTodo, Inbox } from "lucide-react";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";
import { CompanyJoinRequestsPanel } from "./CompanyJoinRequestsPanel";
import { InvitationsTable } from "./InvitationsTable";
import { WaitlistTable } from "./WaitlistTable";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePendingApprovals } from "@/hooks/useUserApproval";
import { useSystemStats } from "@/hooks/useAdminData";

function CountBadge({ value }: { value: number }) {
  if (!value) return null;
  return (
    <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] leading-none">
      {value}
    </Badge>
  );
}

export function AccessRequestsPanel({ defaultTab = "approvals" }: { defaultTab?: string }) {
  const { data: approvals } = usePendingApprovals();
  const { data: stats } = useSystemStats();
  const joinQ = useQuery({
    queryKey: ["admin-join-request-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("company_join_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const approvalsCount = approvals?.length ?? 0;
  const joinCount = joinQ.data ?? 0;
  const waitlistCount = stats?.waitlist_count ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Access Requests
        </CardTitle>
        <CardDescription>
          One unified queue for every way someone can ask for access: new sign-ups, join
          requests, outstanding invitations and the public waitlist.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="approvals" className="gap-1.5">
              <UserCheck className="h-3.5 w-3.5" />
              Pending Approvals
              <CountBadge value={approvalsCount} />
            </TabsTrigger>
            <TabsTrigger value="join" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Join Requests
              <CountBadge value={joinCount} />
            </TabsTrigger>
            <TabsTrigger value="invitations" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Invitations
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="gap-1.5">
              <ListTodo className="h-3.5 w-3.5" />
              Waitlist
              <CountBadge value={waitlistCount} />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="approvals" className="mt-0"><PendingApprovalsPanel /></TabsContent>
          <TabsContent value="join" className="mt-0"><CompanyJoinRequestsPanel /></TabsContent>
          <TabsContent value="invitations" className="mt-0"><InvitationsTable /></TabsContent>
          <TabsContent value="waitlist" className="mt-0"><WaitlistTable /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}