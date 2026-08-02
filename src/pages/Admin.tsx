/**
 * /admin — REFACTORED IA (Phases 1–4 complete)
 * ----------------------------------------------------------------
 * Top-level sections collapsed from 8 → 5. Sub-pages live in a
 * vertical LEFT RAIL inside each section (no second-row strip).
 *
 * Phase 1: 5-tab top nav + left rail + universal header + real counts +
 *          auto-collapse global rail + ?section=/?page= URL with legacy
 *          ?tab= redirects.
 * Phase 2: universal EventDrawer wired across User Activity, Delivery
 *          Audit, Audit Log, Error Logs and Users/Companies tables.
 * Phase 3: SignalStack relocated to /signal, Blog relocated to /studio,
 *          with in-place "moved" banners + URL forwarders.
 * Phase 4: People IA collapsed — Users + External merged into one
 *          directory (PeopleDirectoryPanel); Companies + External
 *          Entities merged (CompaniesDirectoryPanel); Pending Approvals,
 *          Join Requests, Invitations and Waitlist collapsed into a
 *          single Access Requests pipeline (AccessRequestsPanel).
 *
 * Legacy → new map (URL):
 *   ?section=users                        → ?section=people&page=<tab>
 *     - users/companies/demo-metrics/activity → people/<same>
 *     - external                               → people/users (merged)
 *     - pending-approvals/join-requests/
 *       invitations/waitlist                   → people/access-requests
 *   ?section=access&tab=pages             → access/pages
 *   ?section=access&tab=permissions       → access/permissions
 *   ?section=access&tab=company-features  → access/company-features
 *   ?section=access&tab=notifications-admin   → communications/notifications
 *   ?section=access&tab=notification-audit    → communications/delivery-audit
 *   ?section=access&tab=announcements     → communications/announcements
 *   ?section=data-security&tab=data       → platform/data
 *   ?section=data-security&tab=security   → platform/security
 *   ?section=data-security&tab=integrations → platform/integrations
 *   ?section=data-security&tab=emails     → communications/emails
 *   ?section=data-security&tab=qb-mapping → platform/qb-mapping
 *   ?section=settings&tab=settings        → platform/settings
 *   ?section=settings&tab=reports         → platform/reports
 *   ?section=settings&tab=errors          → observability/errors
 *   ?section=settings&tab=audit           → observability/audit
 *   ?section=product-enhancement&tab=signalstack → /signal
 *   ?section=support&tab=client-viewer    → people/client-lookup
 *   ?section=usage-analytics&tab=usage-overview → observability/usage-overview
 *   ?section=usage-analytics&tab=pilot-kpis     → observability/pilot-kpis
 *   ?section=blog&tab=blog-all|new|media  → /studio?tab=all|new|media
 */
import { useState, useEffect, useMemo } from "react";
import { Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Users, Building2, Mail, ClipboardList, MessageSquare,
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
import { AuditLogTable } from "@/components/admin/AuditLogTable";
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
import { ClientAccountViewer } from "@/components/admin/ClientAccountViewer";
import { CompanyFeaturesPanel } from "@/components/admin/CompanyFeaturesPanel";
import { AIRulesPanel } from "@/components/admin/AIRulesPanel";
import { QbCashflowMappingPanel } from "@/components/admin/QbCashflowMappingPanel";
import { RecurringReportsPanel } from "@/components/admin/RecurringReportsPanel";
import { UsageAnalyticsPanel } from "@/components/admin/usage-analytics/UsageAnalyticsPanel";
import { PilotKpiOverview } from "@/components/admin/usage-analytics/PilotKpiOverview";
import { CreateDemoAccessModal } from "@/components/admin/CreateDemoAccessModal";
import { UserActivityPanel } from "@/components/admin/UserActivityPanel";
import { StandardDemoPanel } from "@/components/admin/StandardDemoPanel";
import { DemoMetricsPanel } from "@/components/admin/DemoMetricsPanel";
import { PerfDiagnosticsPanel } from "@/components/admin/PerfDiagnosticsPanel";
import { AccessRequestsPanel } from "@/components/admin/AccessRequestsPanel";
import { PeopleDirectoryPanel } from "@/components/admin/PeopleDirectoryPanel";
import { CompaniesDirectoryPanel } from "@/components/admin/CompaniesDirectoryPanel";
import { AgentAccessPanel } from "@/components/admin/AgentAccessPanel";

// ─── New IA ───────────────────────────────────────────────────────
// Phase 5: collapsed top-level nav from 5 → 3 tabs:
//   - users-permissions (= People + Access & Permissions)
//   - communication      (= Communications)
//   - platform           (= Platform + Observability)
// All existing page IDs are preserved so renderSubPageContent and
// every backward-compatible URL mapping continue to work.
type SectionId = "users-permissions" | "communication" | "platform";
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
    id: "users-permissions",
    label: "Users & Permissions",
    icon: UsersRound,
    pages: [
      // Directory
      { id: "users", label: "Users", icon: Users, group: "Directory", description: "Local accounts + synced external profiles in one directory.", cta: { label: "Create Demo Access", action: "demo" } },
      { id: "companies", label: "Companies", icon: Building2, group: "Directory", description: "Registered companies and synced external entities." },
      { id: "demo-metrics", label: "Demo Users & Metrics", icon: BarChart3, group: "Directory", description: "Engagement snapshot for every demo / pilot workspace." },
      { id: "access-requests", label: "Access Requests", icon: UserCheck, group: "Directory", countKey: "accessRequests", description: "Approvals, join requests, invitations and waitlist — one queue." },
      { id: "client-lookup", label: "Client Lookup", icon: Search, group: "Directory", description: "Open any company's workspace as if you were a member." },
      { id: "activity", label: "Activity", icon: Activity, group: "Directory", description: "Recent user sessions and actions." },
      // Permissions & Access
      { id: "permissions", label: "User Permissions", icon: KeyRound, group: "Permissions & Access", description: "Scope and capability flags per user." },
      { id: "pages", label: "Page Access", icon: Layout, group: "Permissions & Access", description: "Control which pages are visible to which audiences." },
      { id: "company-features", label: "Company Features", icon: ToggleRight, group: "Permissions & Access", description: "Per-company feature toggles. 5th Line always has full access." },
      { id: "agent-access", label: "Agent Access", icon: ShieldHalf, group: "Permissions & Access", description: "Master company-by-company agent entitlements." },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MegaphoneIcon,
    pages: [
      { id: "notifications", label: "Dev Updates & Notifications", icon: Bell, description: "Notification rules, channels, templates and default recipients.", cta: { label: "New Rule", action: "demo" } },
      { id: "delivery-audit", label: "Delivery Audit", icon: ClipboardList, description: "Every notification sent, queued, or failed." },
      { id: "announcements", label: "Announcements", icon: Megaphone, group: "Announcements & Email Templates", description: "System-wide announcements." },
      { id: "emails", label: "Email Templates", icon: Mail, group: "Announcements & Email Templates", description: "Customize transactional email templates." },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Server,
    pages: [
      // Platform Settings / Feature Flags
      { id: "settings", label: "General", icon: Settings, group: "Platform Settings", description: "Maintenance mode, sessions and platform defaults." },
      // Integrations / Infrastructure
      { id: "integrations", label: "Integrations", icon: Webhook, group: "Integrations / Infrastructure", description: "Webhook and sync activity across third-party systems." },
      { id: "qb-mapping", label: "Data Mapping", icon: Wallet, group: "Integrations / Infrastructure", description: "QuickBooks → cash flow mapping and entity bindings." },
      // Workflows / Automation
      { id: "reports", label: "Recurring Reports", icon: FileText, group: "Workflows / Automation", description: "Recurring UX & engagement reports.", cta: { label: "Create Report", action: "demo" } },
      // Data / Security
      { id: "data", label: "Data", icon: Database, group: "Data / Security", description: "Demo data controls and exports." },
      { id: "security", label: "Security", icon: Lock, group: "Data / Security", description: "IP allowlist and blocked IPs." },
      // Logs / Observability
      { id: "audit", label: "Audit Log", icon: ClipboardList, group: "Logs / Observability", description: "Track admin actions." },
      { id: "errors", label: "Errors", icon: AlertCircle, group: "Logs / Observability", countKey: "errors", description: "Aggregated error tracking." },
      // System Metrics / Audit Trails
      { id: "usage-overview", label: "Analytics Overview", icon: BarChart3, group: "System Metrics", description: "Company-level engagement overview." },
      { id: "pilot-kpis", label: "Pilot KPIs", icon: Activity, group: "System Metrics", description: "Pilot KPI tracker." },
      { id: "ai-audit", label: "AI Action Audit", icon: ClipboardList, group: "AI", description: "Review every AI-driven action." },
      { id: "api-usage", label: "API Usage", icon: BarChart3, group: "AI", description: "LLM API calls, input/output tokens and cost drivers by provider and action." },
      { id: "ai-training", label: "AI Training", icon: Brain, group: "AI", description: "Prompts, model config and AI performance." },
      { id: "ux-analytics", label: "UX Analytics", icon: BarChart3, group: "Insights", description: "Funnel and friction analytics." },
      { id: "performance", label: "Performance", icon: Gauge, group: "Insights", description: "Live client perf diagnostics: realtime channels, intervals, long tasks, memory." },
    ],
  },
];

// Old (?section,?tab) → new (?section,?page) remap.
const LEGACY_SECTION_PAGE: Record<string, { section: SectionId; page?: string }> = {
  // Pre-Phase-4 section IDs
  "users":               { section: "users-permissions" },
  "access":              { section: "users-permissions", page: "pages" },
  "data-security":       { section: "platform" },
  "settings":            { section: "platform", page: "settings" },
  "product-enhancement": { section: "platform", page: "signalstack" },
  "support":             { section: "users-permissions", page: "client-lookup" },
  "usage-analytics":     { section: "platform", page: "usage-overview" },
  "blog":                { section: "communication", page: "blog-all" },
  // Phase-4 section IDs (kept working after Phase-5 consolidation)
  "people":              { section: "users-permissions" },
  "communications":      { section: "communication" },
  "observability":       { section: "platform", page: "audit" },
};
const LEGACY_TAB_TO_PAGE: Record<string, { section: SectionId; page: string }> = {
  // From users
  "pending-approvals":     { section: "users-permissions", page: "access-requests" },
  "join-requests":         { section: "users-permissions", page: "access-requests" },
  "users":                 { section: "users-permissions", page: "users" },
  "companies":             { section: "users-permissions", page: "companies" },
  "demo-metrics":          { section: "users-permissions", page: "demo-metrics" },
  "activity":              { section: "users-permissions", page: "activity" },
  "external":              { section: "users-permissions", page: "users" },
  "invitations":           { section: "users-permissions", page: "access-requests" },
  // From access
  "pages":                 { section: "users-permissions", page: "pages" },
  "permissions":           { section: "users-permissions", page: "permissions" },
  "company-features":      { section: "users-permissions", page: "company-features" },
  "agent-access":          { section: "users-permissions", page: "agent-access" },
  "notifications-admin":   { section: "communication", page: "notifications" },
  "notification-audit":    { section: "communication", page: "delivery-audit" },
  "announcements":         { section: "communication", page: "announcements" },
  "waitlist":              { section: "users-permissions", page: "access-requests" },
  // From data-security
  "data":                  { section: "platform", page: "data" },
  "security":              { section: "platform", page: "security" },
  "integrations":          { section: "platform", page: "integrations" },
  "emails":                { section: "communication", page: "emails" },
  "qb-mapping":            { section: "platform", page: "qb-mapping" },
  // From settings
  "settings":              { section: "platform", page: "settings" },
  "reports":               { section: "platform", page: "reports" },
  "errors":                { section: "platform", page: "errors" },
  "audit":                 { section: "platform", page: "audit" },
  // From product-enhancement / support / analytics
  "signalstack":           { section: "platform", page: "signalstack" },
  "client-viewer":         { section: "users-permissions", page: "client-lookup" },
  "usage-overview":        { section: "platform", page: "usage-overview" },
  "pilot-kpis":            { section: "platform", page: "pilot-kpis" },
  "ai-training":           { section: "platform", page: "ai-training" },
  "ai-audit":              { section: "platform", page: "ai-audit" },
  "ux-analytics":          { section: "platform", page: "ux-analytics" },
  "performance":           { section: "platform", page: "performance" },
  "client-lookup":         { section: "users-permissions", page: "client-lookup" },
  "access-requests":       { section: "users-permissions", page: "access-requests" },
  "delivery-audit":        { section: "communication", page: "delivery-audit" },
  "notifications":         { section: "communication", page: "notifications" },
  // Blog
  "blog-all":              { section: "communication", page: "blog-all" },
  "blog-new":              { section: "communication", page: "blog-new" },
  "blog-media":            { section: "communication", page: "blog-media" },
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
  const navigate = useNavigate();
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();

  // ─── URL parsing with legacy redirect ───────────────────────────
  const rawSection = searchParams.get("section") || "";
  const rawPage    = searchParams.get("page")    || "";
  const rawTab     = searchParams.get("tab")     || "";

  // Phase 3 relocations — SignalStack now lives at /signal, Blog at /studio.
  // Any legacy link that still points into /admin for those surfaces is
  // forwarded to the new top-level route.
  useEffect(() => {
    if (rawPage === "signalstack" || rawTab === "signalstack" || rawSection === "product-enhancement") {
      navigate("/signal", { replace: true });
      return;
    }
    if (rawPage === "blog-all" || rawTab === "blog-all" || rawSection === "blog") {
      navigate("/studio?tab=all", { replace: true });
      return;
    }
    if (rawPage === "blog-new" || rawTab === "blog-new") {
      navigate("/studio?tab=new", { replace: true });
      return;
    }
    if (rawPage === "blog-media" || rawTab === "blog-media") {
      navigate("/studio?tab=media", { replace: true });
    }
  }, [rawSection, rawPage, rawTab, navigate]);

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
    // Legacy ?page= IDs from the pre-Phase-4 IA (now merged into Access Requests / Directory).
    if (rawPage && LEGACY_TAB_TO_PAGE[rawPage]) {
      return LEGACY_TAB_TO_PAGE[rawPage];
    }
    if (rawSection && LEGACY_SECTION_PAGE[rawSection]) {
      const remap = LEGACY_SECTION_PAGE[rawSection];
      const sec = SECTIONS.find(s => s.id === remap.section)!;
      return { section: sec.id, page: remap.page ?? sec.pages[0].id };
    }
    // Modern section, no/unknown page → first page
    if (known) return { section: known.id, page: known.pages[0].id };
    // Default
    return { section: "users-permissions" as SectionId, page: "users" };
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

  // Hooks MUST run before any conditional early-return below to satisfy the
  // Rules of Hooks. (Previously declared further down the body; moving it
  // here avoids a "Rendered more hooks than during the previous render"
  // crash when `roleLoading` flips false.)
  const groupedPages = useMemo(() => {
    const groups: { name: string | null; pages: PageDef[] }[] = [];
    activeSection.pages.forEach((p) => {
      const key = p.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.name === key) last.pages.push(p);
      else groups.push({ name: key, pages: [p] });
    });
    return groups;
  }, [activeSection]);

  if (roleLoading) {
    return (
      <div className="bg-transparent">
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
      case "access-requests":
        return <AccessRequestsPanel />;
      case "users":
        return <PeopleDirectoryPanel />;
      case "companies":
        return <CompaniesDirectoryPanel />;
      case "activity":
        return <UserActivityPanel />;
      case "demo-metrics":
        return (
          <div className="space-y-4">
            <StandardDemoPanel />
            <DemoMetricsPanel />
          </div>
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
      case "agent-access":
        return <AgentAccessPanel />;
      case "notifications":
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
      case "delivery-audit":
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
      case "performance":
        return <PerfDiagnosticsPanel />;
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
      case "client-lookup":
        return <ClientAccountViewer />;
      case "usage-overview":
        return <UsageAnalyticsPanel />;
      case "pilot-kpis":
        return <PilotKpiOverview />;
      default:
        return null;
    }
  };

  const SectionIcon = activeSection.icon;
  const PageIcon = activePage.icon;

  // Resolve count for badges (only rendered when > 0).
  const countFor = (key?: PageDef["countKey"]) => (key ? counts[key] : 0) ?? 0;

  // Section-level count = sum of its pages' counts.
  const sectionCount = (s: SectionDef) =>
    s.pages.reduce((acc, p) => acc + countFor(p.countKey), 0);

  const handleCta = () => {
    // Phase 1: only the demo modal is wired. Other CTAs are no-ops
    // placeholders that Phase 2-4 will hook up to the right flows.
    if (activePage.cta?.action === "demo") setDemoModalOpen(true);
  };

  return (
    <div className="bg-transparent">
      <div className="container mx-auto py-5 px-4 space-y-4">
        {/* Stats overview (kept — already a thin row, not the hero card) */}
        <AdminStatsCards stats={stats ?? null} isLoading={statsLoading} />

        {/* Top tabs: 5 sections, icon + label, real counts only */}
        <ScrollArea className="w-full">
          <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg w-max">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = s.id === resolved.section;
              const c = sectionCount(s);
              return (
                <button
                  key={s.id}
                  onClick={() => setNav(s.id, s.pages[0].id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                  {c > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] leading-none">
                      {c}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Universal page header: breadcrumb + CTA (outside the page card). */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <button
              onClick={() => setSidebarOpen(sidebarState !== "expanded")}
              className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted/60 text-muted-foreground"
              aria-label="Toggle global navigation rail"
              title="Toggle global navigation"
            >
              {sidebarState === "expanded" ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
            </button>
            <Shield className="h-3.5 w-3.5" />
            <span>Admin</span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span>{activeSection.label}</span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="text-foreground font-medium truncate">{activePage.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {activePage.cta && (
              <Button size="sm" className="h-8" onClick={handleCta}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {activePage.cta.label}
              </Button>
            )}
          </div>
        </div>

        {/* Body: left rail + page content */}
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          {/* Left rail — section pages */}
          <aside className="rounded-xl border border-border bg-card p-2 h-fit md:sticky md:top-4">
            <div className="px-2 py-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <SectionIcon className="h-3.5 w-3.5" />
              {activeSection.label}
            </div>
            <nav className="mt-1 space-y-0.5">
              {groupedPages.map((g, gi) => (
                <div key={`${g.name ?? "main"}-${gi}`} className="space-y-0.5">
                  {g.name && (
                    <div className="mt-2 px-2 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {g.name}
                    </div>
                  )}
                  {g.pages.map((p) => {
                    const Icon = p.icon;
                    const isActive = p.id === resolved.page;
                    const c = countFor(p.countKey);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setNav(activeSection.id, p.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">{p.label}</span>
                        {c > 0 && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] leading-none">
                            {c}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>

          {/* Page content */}
          <main className="min-w-0">
            {/* Thin strip: icon + title + description (replaces the giant "N of 8" hero) */}
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <PageIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight truncate">{activePage.label}</div>
                {activePage.description && (
                  <div className="text-[11px] text-muted-foreground truncate">{activePage.description}</div>
                )}
              </div>
            </div>

            <div
              key={`${resolved.section}:${resolved.page}`}
              className="animate-in fade-in slide-in-from-bottom-1 duration-150"
            >
              {renderSubPageContent(resolved.page)}
            </div>
          </main>
        </div>
      </div>
      <CreateDemoAccessModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />
    </div>
  );
};

export default Admin;
