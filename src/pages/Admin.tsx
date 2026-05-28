/**
 * /admin — REFACTORED IA (Phase 1 of 4)
 * ----------------------------------------------------------------
 * Top-level sections collapsed from 8 → 5. Sub-pages live in a
 * vertical LEFT RAIL inside each section (no second-row strip).
 *
 * Phase 1 scope (this commit):
 *   - New 5-tab top nav (People / Access / Communications / Platform / Observability)
 *   - Left-rail sub-nav per section
 *   - Universal page header (breadcrumb + CTA outside card)
 *   - Real tab counts (rendered only when > 0)
 *   - Auto-collapse of global left icon rail + expand toggle
 *   - URL: ?section=<id>&page=<id>; legacy ?section=…&tab=… redirected
 *   - All existing panels keep working; data hooks untouched
 *
 * Phase 2 (next): universal <EventTable /> + right-side detail drawer
 * Phase 3: relocate SignalStack → /signal, Blog → /studio + banners
 * Phase 4: merge Users + External, Companies + External Deals/Lenders,
 *          collapse 4 access-request views into one pipeline
 *
 * Legacy → new map (URL):
 *   ?section=users                        → ?section=people&page=<tab>
 *     - pending-approvals/join-requests/users/companies/demo-metrics/
 *       activity/external/invitations    → people/<same>
 *   ?section=access&tab=pages             → access/pages
 *   ?section=access&tab=permissions       → access/permissions
 *   ?section=access&tab=company-features  → access/company-features
 *   ?section=access&tab=notifications-admin   → communications/notifications
 *   ?section=access&tab=notification-audit    → communications/delivery-audit
 *   ?section=access&tab=announcements     → communications/announcements
 *   ?section=access&tab=waitlist          → people/waitlist
 *   ?section=data-security&tab=data       → platform/data
 *   ?section=data-security&tab=security   → platform/security
 *   ?section=data-security&tab=integrations → platform/integrations
 *   ?section=data-security&tab=emails     → communications/emails
 *   ?section=data-security&tab=qb-mapping → platform/qb-mapping
 *   ?section=settings&tab=settings        → platform/settings
 *   ?section=settings&tab=reports         → platform/reports
 *   ?section=settings&tab=errors          → observability/errors
 *   ?section=settings&tab=audit           → observability/audit
 *   ?section=product-enhancement&tab=signalstack → observability/signalstack (Phase 3 → /signal)
 *   ?section=support&tab=client-viewer    → people/client-lookup
 *   ?section=usage-analytics&tab=usage-overview → observability/usage-overview
 *   ?section=usage-analytics&tab=pilot-kpis     → observability/pilot-kpis
 *   ?section=blog&tab=blog-all|new|media  → communications/blog-<all|new|media> (Phase 3 → /studio)
 */
import { useState, useEffect, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Users, Building2, ListTodo, Mail, ClipboardList, Cloud, MessageSquare,
  Settings, Megaphone, Lock, Webhook, AlertCircle, Database, Layout,
  PanelLeftOpen, PanelLeftClose,
  Cog, Lightbulb, UserCheck, Bell, MonitorPlay, ToggleRight, Brain, Wallet, FileText,
  BarChart3, Plus, Activity, Newspaper, Image as ImageIcon, ChevronRight, Eye,
  UsersRound, ShieldHalf, Megaphone as MegaphoneIcon, Server, Gauge, KeyRound, Search
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useSystemStats } from "@/hooks/useAdminData";
import { usePendingApprovals } from "@/hooks/useUserApproval";
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
import { UXRecommendationsPanel } from "@/components/admin/ux-analytics/UXRecommendationsPanel";
import { UXAnalyticsPanel } from "@/components/admin/UXAnalyticsPanel";
import { AITrainingPanel } from "@/components/admin/AITrainingPanel";
import { AIActionAuditPanel } from "@/components/admin/AIActionAuditPanel";
import { PendingApprovalsPanel } from "@/components/admin/PendingApprovalsPanel";
import { CompanyJoinRequestsPanel } from "@/components/admin/CompanyJoinRequestsPanel";
import { ClientAccountViewer } from "@/components/admin/ClientAccountViewer";
import { CompanyFeaturesPanel } from "@/components/admin/CompanyFeaturesPanel";
import { AIRulesPanel } from "@/components/admin/AIRulesPanel";
import { QbCashflowMappingPanel } from "@/components/admin/QbCashflowMappingPanel";
import { RecurringReportsPanel } from "@/components/admin/RecurringReportsPanel";
import { UsageAnalyticsPanel } from "@/components/admin/usage-analytics/UsageAnalyticsPanel";
import { PilotKpiOverview } from "@/components/admin/usage-analytics/PilotKpiOverview";
import { CreateDemoAccessModal } from "@/components/admin/CreateDemoAccessModal";
import { UserActivityPanel } from "@/components/admin/UserActivityPanel";
import { DemoMetricsPanel } from "@/components/admin/DemoMetricsPanel";
import { BlogManagementPanel } from "@/components/admin/BlogManagementPanel";
import { SignalStackApp } from "@/components/admin/signalstack/SignalStackApp";

// ─── New IA ───────────────────────────────────────────────────────
type SectionId = "people" | "access" | "communications" | "platform" | "observability";
type PageDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey?: "accessRequests" | "joinRequests" | "pendingApprovals" | "waitlist" | "errors";
  cta?: { label: string; action: "demo" };
  description?: string;
  group?: string; // optional left-rail group header
};
type SectionDef = {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pages: PageDef[];
};

const SECTIONS: SectionDef[] = [
  {
    id: "people",
    label: "People",
    icon: UsersRound,
    pages: [
      { id: "users", label: "All Users", icon: Users, description: "Every registered user across all companies.", cta: { label: "Create Demo Access", action: "demo" } },
      { id: "companies", label: "Companies", icon: Building2, description: "Registered companies and their members." },
      { id: "pending-approvals", label: "Pending Approvals", icon: UserCheck, countKey: "pendingApprovals", description: "Users awaiting admin approval before first sign-in.", group: "Access Requests" },
      { id: "join-requests", label: "Join Requests", icon: Building2, countKey: "joinRequests", description: "Existing users requesting to join a workspace.", group: "Access Requests" },
      { id: "invitations", label: "Invitations", icon: Mail, description: "Outstanding company invitations.", group: "Access Requests" },
      { id: "waitlist", label: "Waitlist", icon: ListTodo, countKey: "waitlist", description: "External signups waiting on capacity.", group: "Access Requests" },
      { id: "activity", label: "Activity", icon: Activity, description: "Recent user sessions and actions." },
      { id: "external", label: "External", icon: Cloud, description: "External deals, lenders and partner data." },
      { id: "demo-metrics", label: "Demo Metrics", icon: BarChart3, description: "Engagement snapshot for every demo / pilot workspace." },
      { id: "client-lookup", label: "Client Lookup", icon: Search, description: "Open any company's workspace as if you were a member." },
    ],
  },
  {
    id: "access",
    label: "Access & Permissions",
    icon: ShieldHalf,
    pages: [
      { id: "pages", label: "Page Access", icon: Layout, description: "Control which pages are visible to which audiences." },
      { id: "permissions", label: "User Permissions", icon: KeyRound, description: "Scope and capability flags per user." },
      { id: "company-features", label: "Company Features", icon: ToggleRight, description: "Per-company feature toggles. 5th Line always has full access." },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    icon: MegaphoneIcon,
    pages: [
      { id: "notifications", label: "Notifications", icon: Bell, description: "Notification rules, channels, templates and default recipients.", cta: { label: "New Rule", action: "demo" } },
      { id: "delivery-audit", label: "Delivery Audit", icon: ClipboardList, description: "Every notification sent, queued, or failed." },
      { id: "announcements", label: "Announcements", icon: Megaphone, description: "System-wide announcements." },
      { id: "emails", label: "Email Templates", icon: Mail, description: "Customize transactional email templates." },
      { id: "blog-all", label: "Blog · All Posts", icon: Newspaper, description: "Studio (moves to /studio in v2).", group: "Studio (legacy)" },
      { id: "blog-new", label: "Blog · New Post", icon: Plus, description: "Compose a new blog post.", group: "Studio (legacy)" },
      { id: "blog-media", label: "Blog · Media Library", icon: ImageIcon, description: "Uploaded blog media.", group: "Studio (legacy)" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Server,
    pages: [
      { id: "settings", label: "General", icon: Settings, description: "Maintenance mode, sessions and platform defaults." },
      { id: "integrations", label: "Integrations", icon: Webhook, description: "Webhook and sync activity across third-party systems." },
      { id: "qb-mapping", label: "Data Mapping", icon: Wallet, description: "QuickBooks → cash flow mapping and entity bindings." },
      { id: "reports", label: "Reports", icon: FileText, description: "Recurring UX & engagement reports.", cta: { label: "Create Report", action: "demo" } },
      { id: "data", label: "Data", icon: Database, description: "Demo data controls and exports." },
      { id: "security", label: "Security", icon: Lock, description: "IP allowlist and blocked IPs." },
    ],
  },
  {
    id: "observability",
    label: "Observability",
    icon: Gauge,
    pages: [
      { id: "activity", label: "Activity", icon: Activity, description: "Cross-workspace user activity stream." },
      { id: "audit", label: "Audit Log", icon: ClipboardList, description: "Track admin actions." },
      { id: "errors", label: "Errors", icon: AlertCircle, countKey: "errors", description: "Aggregated error tracking." },
      { id: "usage-overview", label: "Analytics Overview", icon: BarChart3, description: "Company-level engagement overview." },
      { id: "pilot-kpis", label: "Pilot KPIs", icon: Activity, description: "Pilot KPI tracker." },
      { id: "ai-audit", label: "AI Action Audit", icon: ClipboardList, description: "Review every AI-driven action.", group: "AI" },
      { id: "ai-training", label: "AI Training", icon: Brain, description: "Prompts, model config and AI performance.", group: "AI" },
      { id: "ux-analytics", label: "UX Analytics", icon: BarChart3, description: "Funnel and friction analytics.", group: "Insights" },
      { id: "signalstack", label: "SignalStack", icon: Lightbulb, description: "Product enhancement signals (moves to /signal in v2).", group: "Insights" },
    ],
  },
];

// Old (?section,?tab) → new (?section,?page) remap.
const LEGACY_SECTION_PAGE: Record<string, { section: SectionId; page?: string }> = {
  "users":               { section: "people" },
  "access":              { section: "access" },
  "data-security":       { section: "platform" },
  "settings":            { section: "platform", page: "settings" },
  "product-enhancement": { section: "observability", page: "signalstack" },
  "support":             { section: "people", page: "client-lookup" },
  "usage-analytics":     { section: "observability" },
  "blog":                { section: "communications", page: "blog-all" },
};
const LEGACY_TAB_TO_PAGE: Record<string, { section: SectionId; page: string }> = {
  // From users
  "pending-approvals":     { section: "people", page: "pending-approvals" },
  "join-requests":         { section: "people", page: "join-requests" },
  "users":                 { section: "people", page: "users" },
  "companies":             { section: "people", page: "companies" },
  "demo-metrics":          { section: "people", page: "demo-metrics" },
  "activity":              { section: "people", page: "activity" },
  "external":              { section: "people", page: "external" },
  "invitations":           { section: "people", page: "invitations" },
  // From access
  "pages":                 { section: "access", page: "pages" },
  "permissions":           { section: "access", page: "permissions" },
  "company-features":      { section: "access", page: "company-features" },
  "notifications-admin":   { section: "communications", page: "notifications" },
  "notification-audit":    { section: "communications", page: "delivery-audit" },
  "announcements":         { section: "communications", page: "announcements" },
  "waitlist":              { section: "people", page: "waitlist" },
  // From data-security
  "data":                  { section: "platform", page: "data" },
  "security":              { section: "platform", page: "security" },
  "integrations":          { section: "platform", page: "integrations" },
  "emails":                { section: "communications", page: "emails" },
  "qb-mapping":            { section: "platform", page: "qb-mapping" },
  // From settings
  "settings":              { section: "platform", page: "settings" },
  "reports":               { section: "platform", page: "reports" },
  "errors":                { section: "observability", page: "errors" },
  "audit":                 { section: "observability", page: "audit" },
  // From product-enhancement / support / analytics
  "signalstack":           { section: "observability", page: "signalstack" },
  "client-viewer":         { section: "people", page: "client-lookup" },
  "usage-overview":        { section: "observability", page: "usage-overview" },
  "pilot-kpis":            { section: "observability", page: "pilot-kpis" },
  "ai-training":           { section: "observability", page: "ai-training" },
  "ai-audit":              { section: "observability", page: "ai-audit" },
  "ux-analytics":          { section: "observability", page: "ux-analytics" },
  // Blog
  "blog-all":              { section: "communications", page: "blog-all" },
  "blog-new":              { section: "communications", page: "blog-new" },
  "blog-media":            { section: "communications", page: "blog-media" },
};

function useAdminCounts() {
  const { data: stats } = useSystemStats();
  const { data: pendingApprovals } = usePendingApprovals();
  const joinRequestsQ = useQuery({
    queryKey: ["admin-join-request-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("company_join_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  const errorsQ = useQuery({
    queryKey: ["admin-error-count-24h"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("error_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  const pendingApprovalsCount = pendingApprovals?.length ?? 0;
  const joinRequests = joinRequestsQ.data ?? 0;
  const waitlist = stats?.waitlist_count ?? 0;
  return {
    pendingApprovals: pendingApprovalsCount,
    joinRequests,
    waitlist,
    errors: errorsQ.data ?? 0,
    accessRequests: pendingApprovalsCount + joinRequests + waitlist,
  };
}

const Admin = () => {
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const { data: stats, isLoading: statsLoading } = useSystemStats();
  const counts = useAdminCounts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();

  // ─── URL parsing with legacy redirect ───────────────────────────
  const rawSection = searchParams.get("section") || "";
  const rawPage    = searchParams.get("page")    || "";
  const rawTab     = searchParams.get("tab")     || "";

  const resolved = useMemo(() => {
    // Modern: ?section=&page=
    const known = SECTIONS.find(s => s.id === rawSection);
    if (known && known.pages.some(p => p.id === rawPage)) {
      return { section: known.id, page: rawPage };
    }
    // Legacy: ?tab= mapping wins over ?section= mapping
    if (rawTab && LEGACY_TAB_TO_PAGE[rawTab]) {
      return LEGACY_TAB_TO_PAGE[rawTab];
    }
    if (rawSection && LEGACY_SECTION_PAGE[rawSection]) {
      const remap = LEGACY_SECTION_PAGE[rawSection];
      const sec = SECTIONS.find(s => s.id === remap.section)!;
      return { section: sec.id, page: remap.page ?? sec.pages[0].id };
    }
    // Modern section, no/unknown page → first page
    if (known) return { section: known.id, page: known.pages[0].id };
    // Default
    return { section: "people" as SectionId, page: "users" };
  }, [rawSection, rawPage, rawTab]);

  // Persist resolved URL (clean) once.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("section", resolved.section);
    next.set("page", resolved.page);
    if (next.has("tab")) next.delete("tab");
    const currentStr = searchParams.toString();
    const nextStr = next.toString();
    if (currentStr !== nextStr) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.section, resolved.page]);

  const setNav = (section: SectionId, page: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("section", section);
    next.set("page", page);
    if (next.has("tab")) next.delete("tab");
    setSearchParams(next, { replace: false });
  };

  // ─── Auto-collapse global icon rail while on /admin ────────────
  const collapsedOnEntryRef = useState<{ wasOpen: boolean } | null>(null)[0];
  useEffect(() => {
    // Collapse on mount, restore on unmount.
    const wasOpen = sidebarState === "expanded";
    if (wasOpen) setSidebarOpen(false);
    return () => { if (wasOpen) setSidebarOpen(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSection = SECTIONS.find(s => s.id === resolved.section)!;
  const activePage = activeSection.pages.find(p => p.id === resolved.page) ?? activeSection.pages[0];

  if (roleLoading) {
    return (
      <div className="bg-background">
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
      case "activity":
        return <UserActivityPanel />;
      case "demo-metrics":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Demo & Pilot Metrics
              </CardTitle>
              <CardDescription>
                Engagement snapshot for every demo / pilot workspace — sign-ins, AI usage,
                deals created, and trial countdown.
              </CardDescription>
            </CardHeader>
            <CardContent><DemoMetricsPanel /></CardContent>
          </Card>
        );
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
      case "ux-analytics":
        return <UXAnalyticsPanel />;
      case "signalstack":
        return <SignalStackApp />;
      case "ai-training":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Training
              </CardTitle>
              <CardDescription>
                Manage AI prompts, monitor AI performance, and tune model configuration.
              </CardDescription>
            </CardHeader>
            <CardContent><AITrainingPanel /></CardContent>
          </Card>
        );
      case "ai-audit":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                AI Action Audit
              </CardTitle>
              <CardDescription>
                Review every AI-driven action with filters for prompt, intent, confidence, and outcome.
              </CardDescription>
            </CardHeader>
            <CardContent><AIActionAuditPanel /></CardContent>
          </Card>
        );
      case "qb-mapping":
        return <QbCashflowMappingPanel />;
      case "client-viewer":
        return <ClientAccountViewer />;
      case "usage-overview":
        return <UsageAnalyticsPanel />;
      case "pilot-kpis":
        return <PilotKpiOverview />;
      case "blog-all":
        return <BlogManagementPanel subTab="all" />;
      case "blog-new":
        return <BlogManagementPanel subTab="new" />;
      case "blog-media":
        return <BlogManagementPanel subTab="media" />;
      default:
        return null;
    }
  };

  const ActiveIcon = activeSection.icon;
  // Guard: make sure the persisted subpage id actually belongs to the
  // currently-active section. Without this, a stale id from a previous
  // session/URL could fall through to `default: null` (or worse, collide
  // with another section's case — e.g. Access carrying the Users
  // section's "users" id, which would render the Users table).
  const persistedSubPageId = activeSubPage[activeCategory];
  const currentSubPageId =
    activeSection.subPages.some((sp) => sp.id === persistedSubPageId)
      ? persistedSubPageId
      : activeSection.subPages[0]?.id;

  // Sections that intentionally render a "Coming soon" placeholder
  // instead of their sub-page content. Kept in the top-level tab bar so
  // navigation stays consistent.
  const COMING_SOON_SECTIONS: TabCategory[] = [
    "data-security",
  ];
  const isComingSoon = COMING_SOON_SECTIONS.includes(activeCategory);

  return (
    <div className="bg-background">
      <div className="container mx-auto py-6 px-4 space-y-6">
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

        {/* Section picker rail */}
        <ScrollArea className="w-full">
          <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-lg w-max">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.id === activeCategory;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveCategory(s.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                  <span className="text-[10px] text-muted-foreground/70 font-normal">{i + 1}</span>
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Carousel panel */}
        <div
          className="relative rounded-2xl border border-border bg-card shadow-lg overflow-hidden"
          style={{ height: "min(88vh, 1100px)" }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Sticky panel header */}
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-card/95 backdrop-blur">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ActiveIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-tight truncate">{activeSection.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {activeSection.label} · {activeIndex + 1} of {SECTIONS.length}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeCategory === "users" && (
                <Button
                  size="sm"
                  className="h-8 mr-1"
                  onClick={() => setDemoModalOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create Demo Access
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Previous section">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Next section">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sticky sub-tabs */}
          <div className="sticky top-[57px] z-10 border-b border-border bg-card/95 backdrop-blur">
            <ScrollArea className="w-full">
              <div className="flex items-center gap-1 px-3 py-2 w-max">
                {activeSection.subPages.map((sp) => {
                  const Icon = sp.icon;
                  const isActive = currentSubPageId === sp.id;
                  return (
                    <button
                      key={sp.id}
                      onClick={() => handleSubPageChange(activeCategory, sp.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {sp.label}
                    </button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Scrollable panel body with slide transition */}
          <div className="absolute inset-0 top-[105px] overflow-hidden">
            <div
              key={`${activeCategory}:${currentSubPageId}`}
              className="h-full overflow-y-auto px-5 py-5 animate-in fade-in slide-in-from-right-2 duration-200"
            >
              {isComingSoon ? (
                <div className="flex items-center justify-center min-h-[400px]">
                  <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                      <div className="mx-auto h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                        <ActiveIcon className="h-5 w-5" />
                      </div>
                      <CardTitle>{activeSection.label}</CardTitle>
                      <CardDescription>This section is coming soon.</CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              ) : (
                renderSubPageContent(currentSubPageId)
              )}
            </div>
          </div>
        </div>
      </div>
      <CreateDemoAccessModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
    </div>
  );
};

export default Admin;
