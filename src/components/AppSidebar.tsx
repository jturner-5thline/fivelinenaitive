import { LayoutDashboard, Briefcase, BarChart3, Users, Settings, HelpCircle, ShieldCheck, Plug, Newspaper, UserCog, Cog, Workflow, Bot, DollarSign, Menu, CheckSquare, Compass, Video, SlidersHorizontal, Contact, Building2, UserCircle, LogOut, Handshake, Landmark, FileText, PieChart, Mail, SlidersHorizontal as SlidersIcon, Eye, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useClaapRoutingTasks } from '@/hooks/useClaapMeetings';
import { usePendingJoinRequestCount } from '@/hooks/usePendingJoinRequestCount';
import { useUnresolvedFlexSyncCount } from '@/hooks/useUnresolvedFlexSyncCount';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { useTheme } from "next-themes";
import naitiveIconLight from "@/assets/naitive-icon-light.png";
import naitiveIconDark from "@/assets/naitive-icon-dark.png";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { usePageAccessFlags } from "@/hooks/useFeatureFlags";
import { BetaBadge } from "@/components/ui/beta-badge";
import { useCompany } from "@/hooks/useCompany";
import { useNaitivePipelineAccess } from "@/hooks/useNaitivePipelineAccess";
import { useCanAccessInsights } from "@/hooks/useCanAccessInsights";
import { DealsFlyoutMenu } from "@/components/sidebar/DealsFlyoutMenu";
import { InsightsFlyoutMenu } from "@/components/sidebar/InsightsFlyoutMenu";
import { FeedbackButton } from "@/components/FeedbackButton";
import { useHighContrast } from "@/hooks/useHighContrast";


import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// Map page URLs to feature flag names
const menuItems = [
  { title: "Deals", url: "/workspace?tab=deals", icon: Briefcase, featureKey: null }, // Always visible
  // Moved out of the global top header into the sidebar, ordered directly under Deals.
  { title: "Funding Sources", url: "/workspace?tab=lenders", icon: Landmark, featureKey: null },
  { title: "Companies", url: "/crm-companies", icon: Building2, featureKey: null },
  { title: "Contacts", url: "/contacts", icon: Contact, featureKey: null },
  { title: "Reports", url: "/reports", icon: FileText, featureKey: "reports", hideForDemoEmail: true as const },
  
  { title: "AI Agents", url: "/agents", icon: Bot, featureKey: "agents" },
  { title: "Insights", url: "/insights", icon: BarChart3, featureKey: "metrics" },
  { title: "Sales & BD", url: "/sales-bd", icon: Users, featureKey: "sales_bd" },
  { title: "HR", url: "/hr", icon: UserCog, featureKey: "hr" },
  { title: "Operations", url: "/operations", icon: Cog, featureKey: "operations" },
  { title: "Finance", url: "/finance", icon: DollarSign, featureKey: "finance" },
  
  
  { title: "Workflows", url: "/wf", icon: Workflow, featureKey: null, companyFeature: 'workflows_enabled' as const },
];

const footerItems = [
  { title: "Integrations", url: "/integrations", icon: Plug, featureKey: "integrations" },
  { title: "Settings", url: "/settings", icon: Settings, featureKey: null }, // Always visible
  { title: "Help", url: "/help", icon: HelpCircle, featureKey: null }, // Always visible
];

export function AppSidebar() {
  const { state, isHovering, toggleSidebar } = useSidebar();
  const { company } = useCompany();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminRole();
  const { hasPageAccess, isPageBeta, isLoading: isAccessLoading } = usePageAccessFlags();
  const { features: companyFeatures } = useCompanyFeatures();
  const { enabled: highContrast, toggle: toggleHighContrast } = useHighContrast();
  const { data: routingTasks = [] } = useClaapRoutingTasks();
  const { hasAccess: hasNaitivePipelineAccess } = useNaitivePipelineAccess();
  const canAccessInsights = useCanAccessInsights();
  const meetingTaskCount = routingTasks.length;
  const { data: pendingJoinCount = 0 } = usePendingJoinRequestCount();
  const flexSyncUnresolvedCount = useUnresolvedFlexSyncCount();
  const currentPath = location.pathname;
  // Show expanded content if either actually expanded or hovering while collapsed
  const showExpanded = state === "expanded" || (state === "collapsed" && isHovering);
  const iconSrc = resolvedTheme === "dark" ? naitiveIconDark : naitiveIconLight;
  
  // Filter menu items based on feature access — while loading, only show items with no feature gate
  const visibleMenuItems = menuItems.filter(item => {
    // Insights restricted to a specific allowlist
    if (item.url === "/insights" && !canAccessInsights) return false;
    // Insights uses the allowlist as the source of truth — bypass the
    // featureKey/company-override gate once the user is on the allowlist.
    if (item.url === "/insights" && canAccessInsights) return true;
    // Reports hidden for the shared demo account (parity with previous header behavior)
    if ('hideForDemoEmail' in item && item.hideForDemoEmail && user?.email === 'demo@5thline.co') return false;
    // Check page-level feature flag access
    if (item.featureKey !== null && (isAccessLoading || !hasPageAccess(item.featureKey))) return false;
    // Check company-level feature flag
    if ('companyFeature' in item && item.companyFeature && !companyFeatures[item.companyFeature]) return false;
    return true;
  });
  
  const visibleFooterItems = footerItems.filter(item =>
    item.featureKey === null || (!isAccessLoading && hasPageAccess(item.featureKey))
  );

  const isActive = (url: string) => {
    if (url.startsWith("/workspace?tab=")) {
      const tab = url.split("=")[1];
      const currentTab = new URLSearchParams(location.search).get("tab") || "deals";
      return currentPath === "/workspace" && currentTab === tab;
    }
    if (url === "/deals") return currentPath === "/deals";
    if (url === "/tasks") return currentPath === "/tasks";
    if (url === "/deal") return currentPath.startsWith("/deal/");
    return currentPath.startsWith(url);
  };


  return (
    <Sidebar side="left" collapsible="icon" data-tour="sidebar">
      {/* NOTE: avoid `backdrop-blur` here — it re-samples and blurs the
          entire underlying layer on every animation frame, which made the
          sidebar slide-in/out janky and slowed the whole app. Use a solid
          translucent fill + gradient overlay instead. */}
      <SidebarHeader className="relative overflow-hidden px-2 py-3 rounded-t-[11px] rounded-b-lg border-b border-[rgba(126,184,247,0.35)] bg-[rgba(33,52,82,0.92)] text-foreground shadow-glass before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.18)_0%,transparent_55%)]">
        <div className="relative z-[1] flex items-center gap-2">
          <button 
            onClick={toggleSidebar} 
            className="h-9 w-9 rounded-md flex-shrink-0 flex items-center justify-center hover:bg-[rgba(126,184,247,0.2)] transition-colors"
          >
            <Menu className="h-5 w-5 text-sidebar-foreground" />
          </button>
          {showExpanded && <span className="font-semibold text-foreground">{company?.name || ''}</span>}
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:bg-transparent">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => {
                if (item.url === "/deals" || item.url === "/workspace?tab=deals") {
                  return <DealsFlyoutMenu key={item.title} />;
                }
                if (item.url === "/insights") {
                  const showSalesBd = visibleMenuItems.some((i) => i.url === "/sales-bd");
                  const showReports = visibleMenuItems.some((i) => i.url === "/reports");
                  return <InsightsFlyoutMenu key={item.title} showSalesBd={showSalesBd} showReports={showReports} />;
                }
                // Sales & BD and Reports are surfaced via the Insights flyout submenu.
                if (item.url === "/sales-bd" || item.url === "/reports") {
                  return null;
                }
                const slug = item.url.replace(/^\//, '').split('?')[0] || 'home';
                return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/deals"} 
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      data-tour={`nav-${slug}`}
                      title={
                        item.url === "/lenders" && flexSyncUnresolvedCount > 0
                          ? `${flexSyncUnresolvedCount} unresolved FLEx sync requests`
                          : undefined
                      }
                    >
                      <div className="relative">
                        <item.icon className="h-4 w-4" />
                        {item.url === "/tasks" && meetingTaskCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                            {meetingTaskCount}
                          </span>
                        )}
                        {item.url === "/lenders" && flexSyncUnresolvedCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center"
                            aria-label={`${flexSyncUnresolvedCount} unresolved FLEx sync requests`}
                          >
                            {flexSyncUnresolvedCount > 99 ? '99+' : flexSyncUnresolvedCount}
                          </span>
                        )}
                      </div>
                      {showExpanded && (
                        <span className="flex items-center gap-1.5">
                          {item.title}
                          {item.featureKey && <BetaBadge featureKey={`page_${item.featureKey}`} />}
                          {item.url === "/lenders" && flexSyncUnresolvedCount > 0 && (
                            <span
                              className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold leading-none border border-destructive/30"
                              title={`${flexSyncUnresolvedCount} unresolved FLEx sync requests`}
                            >
                              {flexSyncUnresolvedCount > 999 ? '999+' : flexSyncUnresolvedCount}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                );
              })}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive("/admin")}
                    tooltip="Admin"
                  >
                    <NavLink 
                      to="/admin" 
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {showExpanded && <span>Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* For 5th Line accounts (hasNaitivePipelineAccess), the
                  naitive Pipeline and FinServ links are surfaced via the
                  Deals flyout submenu (Debt / FinServ / naitive). */}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {visibleFooterItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.title === "Help" ? (
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                >
                  <a
                    href="mailto:support@naitive.co?subject=naitive%20support%20request"
                    className="hover:bg-sidebar-accent/50"
                  >
                    <item.icon className="h-4 w-4" />
                    {showExpanded && <span>{item.title}</span>}
                  </a>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.url)}
                  tooltip={item.title}
                >
                  <NavLink
                    to={item.url}
                    className="hover:bg-sidebar-accent/50"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  >
                    <div className="relative">
                      <item.icon className={'iconClassName' in item ? (item as any).iconClassName : "h-4 w-4"} />
                      {item.url === "/settings" && pendingJoinCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                          {pendingJoinCount}
                        </span>
                      )}
                    </div>
                    {showExpanded && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}

          <SidebarMenuItem>
            <FeedbackButton showLabel={showExpanded} />
          </SidebarMenuItem>

          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton
                  tooltip="Profile"
                  className="hover:bg-sidebar-accent/50 cursor-pointer"
                >
                  <UserCircle className="h-4 w-4" />
                  {showExpanded && <span>Profile</span>}
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent 
                side="right" 
                align="end" 
                sideOffset={8} 
                className="w-44 p-1"
              >
                <button
                  onClick={() => navigate("/account")}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                >
                  <UserCircle className="h-4 w-4" />
                  Account
                </button>
                <button
                  onClick={toggleHighContrast}
                  aria-pressed={highContrast}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                >
                  <Eye className="h-4 w-4" />
                  <span className="flex-1 text-left">High contrast</span>
                  {highContrast && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
                <button
                  onClick={async () => {
                    await signOut();
                    navigate("/login", { replace: true });
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
