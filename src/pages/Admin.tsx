import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Users, Building2, ListTodo, Mail, Activity } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useSystemStats } from "@/hooks/useAdminData";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { UsersTable } from "@/components/admin/UsersTable";
import { CompaniesTable } from "@/components/admin/CompaniesTable";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { InvitationsTable } from "@/components/admin/InvitationsTable";

const Admin = () => {
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const { data: stats, isLoading: statsLoading } = useSystemStats();

  if (roleLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/deals" replace />;
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage users, companies, and system settings
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <AdminStatsCards stats={stats ?? null} isLoading={statsLoading} />

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="companies" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Companies
          </TabsTrigger>
          <TabsTrigger value="waitlist" className="flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Waitlist
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Invitations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Users
              </CardTitle>
              <CardDescription>
                View and manage all registered users and their roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsersTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="companies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                All Companies
              </CardTitle>
              <CardDescription>
                View all registered companies and their members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompaniesTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waitlist">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListTodo className="h-5 w-5" />
                Waitlist
              </CardTitle>
              <CardDescription>
                Manage users waiting to join the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaitlistTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                All Invitations
              </CardTitle>
              <CardDescription>
                View all company invitations across the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvitationsTable />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
