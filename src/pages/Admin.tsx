import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Shield, Users, Building2, ListTodo, Mail, ClipboardList, Cloud, MessageSquare, 
  Settings, Megaphone, Lock, Webhook, AlertCircle, Database, Layout, ChevronDown,
  ShieldCheck, Cog, Lightbulb, UserCheck, Bell, MonitorPlay, ToggleRight, Brain, Wallet, FileText,
  BarChart3
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
import { SystemSettingsPanel } from "@/components/admin/SystemSettingsPanel";
import { AnnouncementsPanel } from "@/components/admin/AnnouncementsPanel";
import { SecurityPanel } from "@/components/admin/SecurityPanel";
import { EmailTemplatesPanel } from "@/components/admin/EmailTemplatesPanel";
import { IntegrationLogsPanel } from "@/components/admin/IntegrationLogsPanel";
import { ErrorLogsPanel } from "@/components/admin/ErrorLogsPanel";
import { DataManagementPanel } from "@/components/admin/DataManagementPanel";
import { PageAccessPanel } from "@/components/admin/PageAccessPanel";
import { UserPermissionsPanel } from "@/components/admin/UserPermissionsPanel";
import { NotificationRulesPanel } from "@/components/admin/NotificationRulesPanel";
import { NotificationAuditPanel } from "@/components/admin/NotificationAuditPanel";
import { DealsHeader } from "@/components/deals/DealsHeader";
import { UXRecommendationsPanel } from "@/components/admin/ux-analytics/UXRecommendationsPanel";
import { PendingApprovalsPanel } from "@/components/admin/PendingApprovalsPanel";
import { CompanyJoinRequestsPanel } from "@/components/admin/CompanyJoinRequestsPanel";
import { ClientAccountViewer } from "@/components/admin/ClientAccountViewer";
import { CompanyFeaturesPanel } from "@/components/admin/CompanyFeaturesPanel";
import { AIRulesPanel } from "@/components/admin/AIRulesPanel";
import { QbCashflowMappingPanel } from "@/components/admin/QbCashflowMappingPanel";
import { RecurringReportsPanel } from "@/components/admin/RecurringReportsPanel";
import { UsageAnalyticsPanel } from "@/components/admin/usage-analytics/UsageAnalyticsPanel";

// Sub-page configurations
const usersSubPages = [
  { id: "pending-approvals", label: "Pending Approvals", icon: UserCheck },
  { id: "join-requests", label: "Join Requests", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "external", label: "External", icon: Cloud },
  { id: "invitations", label: "Invites", icon: Mail },
];

const accessSubPages = [
  { id: "pages", label: "Page Access", icon: Layout },
  { id: "company-features", label: "Company Features", icon: ToggleRight },
  { id: "permissions", label: "User Permissions", icon: Shield },
  { id: "notifications-admin", label: "Notifications", icon: Bell },
  { id: "notification-audit", label: "Notification Audit", icon: ClipboardList },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "waitlist", label: "Waitlist", icon: ListTodo },
];

const dataSecuritySubPages = [
  { id: "data", label: "Data", icon: Database },
  { id: "security", label: "Security", icon: Lock },
  { id: "integrations", label: "Integrations", icon: Webhook },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "qb-mapping", label: "QB → Cash Flow Mapping", icon: Wallet },
];

const settingsSubPages = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "errors", label: "Errors", icon: AlertCircle },
  { id: "audit", label: "Audit", icon: ClipboardList },
];

const productEnhancementSubPages = [
  { id: "enhancement", label: "UX Analytics", icon: Lightbulb },
  { id: "feedback", label: "Feedback", icon: MessageSquare },
  { id: "ai-training", label: "AI Training", icon: Brain },
];

const supportSubPages = [
  { id: "client-viewer", label: "Client Account Viewer", icon: MonitorPlay },
];

const usageAnalyticsSubPages = [
  { id: "usage-overview", label: "Company Overview", icon: BarChart3 },
];

type TabCategory = "users" | "access" | "data-security" | "settings" | "product-enhancement" | "support" | "usage-analytics";

const Admin = () => {
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const { data: stats, isLoading: statsLoading } = useSystemStats();
  
  const [activeCategory, setActiveCategory] = useState<TabCategory>("users");
  const [activeSubPage, setActiveSubPage] = useState<Record<TabCategory, string>>({
    users: "pending-approvals",
    access: "pages",
    "data-security": "data",
    settings: "settings",
    "product-enhancement": "enhancement",
    support: "client-viewer",
    "usage-analytics": "usage-overview",
  });

  const handleSubPageChange = (category: TabCategory, subPageId: string) => {
    setActiveSubPage((prev) => ({ ...prev, [category]: subPageId }));
  };

  const getSubPages = (category: TabCategory) => {
    switch (category) {
      case "users":
        return usersSubPages;
      case "access":
        return accessSubPages;
      case "data-security":
        return dataSecuritySubPages;
      case "settings":
        return settingsSubPages;
      case "product-enhancement":
        return productEnhancementSubPages;
      case "support":
        return supportSubPages;
      case "usage-analytics":
        return usageAnalyticsSubPages;
    }
  };

  const getCurrentSubPage = (category: TabCategory) => {
    const subPages = getSubPages(category);
    return subPages.find((sp) => sp.id === activeSubPage[category]) || subPages[0];
  };

  if (roleLoading) {
    return (
      <div className="bg-background">
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

  const renderSubPageContent = (subPageId: string) => {
    switch (subPageId) {
      case "pending-approvals":
        return <PendingApprovalsPanel />;
      case "join-requests":
        return <CompanyJoinRequestsPanel />;
      case "users":
        return (
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
        );
      case "companies":
        return (
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
        );
      case "external":
        return <ExternalDataTab />;
      case "invitations":
        return (
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
        );
      case "feedback":
        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    User Feedback
                  </CardTitle>
                  <CardDescription>View feedback submitted by users</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent><FeedbackTable /></CardContent>
          </Card>
        );
      case "pages":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layout className="h-5 w-5" />
                Page Access Control
              </CardTitle>
              <CardDescription>
                Control which pages are visible to users. Set to "5thLine Only" for staging features that only @5thline.co users can see.
              </CardDescription>
            </CardHeader>
            <CardContent><PageAccessPanel /></CardContent>
          </Card>
        );
      case "company-features":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ToggleRight className="h-5 w-5" />
                Company Feature Configuration
              </CardTitle>
              <CardDescription>
                Toggle features on/off for individual companies. 5th Line always has full access.
              </CardDescription>
            </CardHeader>
            <CardContent><CompanyFeaturesPanel /></CardContent>
          </Card>
        );
      case "notifications-admin":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Engine
              </CardTitle>
              <CardDescription>
                Configure notification rules, delivery channels, templates, and default recipients for all notification types.
              </CardDescription>
            </CardHeader>
            <CardContent><NotificationRulesPanel /></CardContent>
          </Card>
        );
      case "notification-audit":
        return <NotificationAuditPanel />;
      case "permissions":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                User Data Permissions
              </CardTitle>
              <CardDescription>
                Control what data each user can access. Restrict by scope (all, team, own) or specific capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent><UserPermissionsPanel /></CardContent>
          </Card>
        );
      case "announcements":
        return (
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
        );
      case "waitlist":
        return (
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
        );
      case "data":
        return (
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
        );
      case "security":
        return (
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
        );
      case "integrations":
        return (
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
        );
      case "emails":
        return (
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
        );
      case "settings":
        return (
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
        );
      case "errors":
        return (
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
        );
      case "reports":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recurring Reports
              </CardTitle>
              <CardDescription>
                Manage automated UX & engagement insights and platform update reports.
              </CardDescription>
            </CardHeader>
            <CardContent><RecurringReportsPanel /></CardContent>
          </Card>
        );
      case "audit":
        return (
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
        );
      case "enhancement":
        return <UXRecommendationsPanel />;
      case "ai-training":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Training & Rules
              </CardTitle>
              <CardDescription>
                Manage organization-wide rules that customize how naitive AI responds. Rules can be added manually, from thumbs-down corrections, or via /teach commands in the chat.
              </CardDescription>
            </CardHeader>
            <CardContent><AIRulesPanel /></CardContent>
          </Card>
        );
      case "qb-mapping":
        return <QbCashflowMappingPanel />;
      case "client-viewer":
        return <ClientAccountViewer />;
      case "usage-overview":
        return <UsageAnalyticsPanel />;
      default:
        return null;
    }
  };

  const TabWithDropdown = ({ 
    category, 
    label, 
    icon: Icon 
  }: { 
    category: TabCategory; 
    label: string; 
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const subPages = getSubPages(category);
    const currentSubPage = getCurrentSubPage(category);
    const isActive = activeCategory === category;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <ChevronDown className="h-3 w-3 ml-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {subPages.map((subPage) => (
            <DropdownMenuItem
              key={subPage.id}
              onClick={() => {
                setActiveCategory(category);
                handleSubPageChange(category, subPage.id);
              }}
              className={activeSubPage[category] === subPage.id ? "bg-accent" : ""}
            >
              <subPage.icon className="h-4 w-4 mr-2" />
              {subPage.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="bg-background">
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
        <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as TabCategory)} className="space-y-6">
          <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit">
            <TabWithDropdown category="users" label="Users" icon={Users} />
            <TabWithDropdown category="access" label="Access" icon={Layout} />
            <TabWithDropdown category="data-security" label="Data & Security" icon={ShieldCheck} />
            <TabWithDropdown category="settings" label="Settings" icon={Cog} />
            <TabWithDropdown category="product-enhancement" label="Product Enhancement" icon={Lightbulb} />
            <TabWithDropdown category="support" label="Support" icon={MonitorPlay} />
            <TabWithDropdown category="usage-analytics" label="Usage Analytics" icon={BarChart3} />
          </div>

          <TabsContent value="users">
            {renderSubPageContent(activeSubPage.users)}
          </TabsContent>

          <TabsContent value="access">
            {renderSubPageContent(activeSubPage.access)}
          </TabsContent>

          <TabsContent value="data-security">
            {renderSubPageContent(activeSubPage["data-security"])}
          </TabsContent>

          <TabsContent value="settings">
            {renderSubPageContent(activeSubPage.settings)}
          </TabsContent>

          <TabsContent value="product-enhancement">
            {renderSubPageContent(activeSubPage["product-enhancement"])}
          </TabsContent>

          <TabsContent value="support">
            {renderSubPageContent(activeSubPage.support)}
          </TabsContent>

          <TabsContent value="usage-analytics">
            {renderSubPageContent(activeSubPage["usage-analytics"])}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
