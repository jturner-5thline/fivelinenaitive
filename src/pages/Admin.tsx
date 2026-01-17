import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Shield, Users, Building2, ListTodo, Mail, ClipboardList, Cloud, MessageSquare, 
  ToggleRight, Settings, Megaphone, Lock, Webhook, AlertCircle, Database 
} from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useSystemStats } from "@/hooks/useAdminData";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { UsersTable } from "@/components/admin/UsersTable";
import { CompaniesTable } from "@/components/admin/CompaniesTable";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { InvitationsTable } from "@/components/admin/InvitationsTable";
import { AuditLogTable } from "@/components/admin/AuditLogTable";
import { ExternalDataTab } from "@/components/admin/ExternalDataTab";
import { FeedbackTable } from "@/components/admin/FeedbackTable";
import { FeatureFlagsTable } from "@/components/admin/FeatureFlagsTable";
import { SystemSettingsPanel } from "@/components/admin/SystemSettingsPanel";
import { AnnouncementsPanel } from "@/components/admin/AnnouncementsPanel";
import { SecurityPanel } from "@/components/admin/SecurityPanel";
import { EmailTemplatesPanel } from "@/components/admin/EmailTemplatesPanel";
import { IntegrationLogsPanel } from "@/components/admin/IntegrationLogsPanel";
import { ErrorLogsPanel } from "@/components/admin/ErrorLogsPanel";
import { DataManagementPanel } from "@/components/admin/DataManagementPanel";
import { DealsHeader } from "@/components/deals/DealsHeader";

const Admin = () => {
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const { data: stats, isLoading: statsLoading } = useSystemStats();

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DealsHeader />
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
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/deals" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <DealsHeader />
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
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Companies
            </TabsTrigger>
            <TabsTrigger value="features" className="flex items-center gap-2">
              <ToggleRight className="h-4 w-4" />
              Features
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Announcements
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="emails" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Errors
            </TabsTrigger>
            <TabsTrigger value="data" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data
            </TabsTrigger>
            <TabsTrigger value="external" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              External
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Feedback
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Waitlist
            </TabsTrigger>
            <TabsTrigger value="invitations" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Invites
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Users
                </CardTitle>
                <CardDescription>View and manage all registered users and their roles</CardDescription>
              </CardHeader>
              <CardContent><UsersTable /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  All Companies
                </CardTitle>
                <CardDescription>View all registered companies and their members</CardDescription>
              </CardHeader>
              <CardContent><CompaniesTable /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ToggleRight className="h-5 w-5" />
                  Feature Access Control
                </CardTitle>
                <CardDescription>Manage feature flags - 5thLine admins always have access</CardDescription>
              </CardHeader>
              <CardContent><FeatureFlagsTable /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Settings
                </CardTitle>
                <CardDescription>Configure maintenance mode, sessions, and defaults</CardDescription>
              </CardHeader>
              <CardContent><SystemSettingsPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="announcements">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Announcements
                </CardTitle>
                <CardDescription>Create and manage system announcements</CardDescription>
              </CardHeader>
              <CardContent><AnnouncementsPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Security & Access
                </CardTitle>
                <CardDescription>Manage IP allowlist and blocked IPs</CardDescription>
              </CardHeader>
              <CardContent><SecurityPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Templates
                </CardTitle>
                <CardDescription>Customize email templates</CardDescription>
              </CardHeader>
              <CardContent><EmailTemplatesPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  Integration Logs
                </CardTitle>
                <CardDescription>Monitor webhook and sync activity</CardDescription>
              </CardHeader>
              <CardContent><IntegrationLogsPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Error Logs
                </CardTitle>
                <CardDescription>View aggregated error tracking</CardDescription>
              </CardHeader>
              <CardContent><ErrorLogsPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Management
                </CardTitle>
                <CardDescription>Demo data controls and exports</CardDescription>
              </CardHeader>
              <CardContent><DataManagementPanel /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="external"><ExternalDataTab /></TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  User Feedback
                </CardTitle>
                <CardDescription>View feedback submitted by users</CardDescription>
              </CardHeader>
              <CardContent><FeedbackTable /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="waitlist">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  Waitlist
                </CardTitle>
                <CardDescription>Manage users waiting to join</CardDescription>
              </CardHeader>
              <CardContent><WaitlistTable /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invitations">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  All Invitations
                </CardTitle>
                <CardDescription>View all company invitations</CardDescription>
              </CardHeader>
              <CardContent><InvitationsTable /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Audit Log
                </CardTitle>
                <CardDescription>Track admin actions</CardDescription>
              </CardHeader>
              <CardContent><AuditLogTable /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
