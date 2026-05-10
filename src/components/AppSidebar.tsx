import { LayoutDashboard, Briefcase, BarChart3, Users, Settings, HelpCircle, ShieldCheck, Plug, Newspaper, UserCog, Cog, Workflow, Bot, DollarSign, Menu, CheckSquare, Compass, Video, SlidersHorizontal, Contact, Building2, UserCircle, LogOut, Handshake, Landmark } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useClaapRoutingTasks } from '@/hooks/useClaapMeetings';
import { usePendingJoinRequestCount } from '@/hooks/usePendingJoinRequestCount';
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
import { DashboardFlyoutMenu } from "@/components/sidebar/DashboardFlyoutMenu";
import { DealsFlyoutMenu } from "@/components/sidebar/DealsFlyoutMenu";
import { FeedbackButton } from "@/components/FeedbackButton";


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
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, featureKey: "dashboard" },
  { title: "Tasks", url: "/tasks", icon: CheckSquare, featureKey: null }, // Always visible
  { title: "Deals", url: "/deals", icon: Briefcase, featureKey: null }, // Always visible
  // Contacts and Companies hidden from sidebar
  // { title: "Contacts", url: "/contacts", icon: Contact, featureKey: "sales_bd" },
  // { title: "Companies", url: "/crm-companies", icon: Building2, featureKey: "sales_bd" },
  // { title: "News Feed", url: "/dashboard?tab=news-feed", icon: Newspaper, featureKey: "newsfeed" },
  
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
  const { data: routingTasks = [] } = useClaapRoutingTasks();
  const { hasAccess: hasNaitivePipelineAccess } = useNaitivePipelineAccess();
  const canAccessInsights = useCanAccessInsights();
  const meetingTaskCount = routingTasks.length;
  const { data: pendingJoinCount = 0 } = usePendingJoinRequestCount();
  const currentPath = location.pathname;
  // Show expanded content if either actually expanded or hovering while collapsed
  const showExpanded = state === "expanded" || (state === "collapsed" && isHovering);
  const iconSrc = resolvedTheme === "dark" ? naitiveIconDark : naitiveIconLight;
  
  // Filter menu items based on feature access — while loading, only show items with no feature gate
  const visibleMenuItems = menuItems.filter(item => {
    // Insights restricted to a specific allowlist
    if (item.url === "/insights" && !canAccessInsights) return false;
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
    if (url === "/dashboard") return currentPath === "/dashboard";
    if (url === "/deals") return currentPath === "/deals";
    if (url === "/tasks") return currentPath === "/tasks";
    if (url === "/deal") return currentPath.startsWith("/deal/");
    return currentPath.startsWith(url);
  };


  return (
    <Sidebar side="left" collapsible="icon" className="h-[calc(100vh-1rem)]" data-tour="sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-2 py-3 rounded-b-xl bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleSidebar} 
            className="h-9 w-9 rounded-md flex-shrink-0 flex items-center justify-center hover:bg-sidebar-accent transition-colors"
          >
            <Menu className="h-5 w-5 text-sidebar-foreground" />
          </button>
          {showExpanded && <span className="font-semibold text-foreground">{company?.name || ''}</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => {
                if (item.url === "/dashboard") {
                  return <DashboardFlyoutMenu key={item.title} />;
                }
                if (item.url === "/deals") {
                  return <DealsFlyoutMenu key={item.title} />;
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
                    >
                      <div className="relative">
                        <item.icon className="h-4 w-4" />
                        {item.url === "/tasks" && meetingTaskCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                            {meetingTaskCount}
                          </span>
                        )}
                      </div>
                      {showExpanded && (
                        <span className="flex items-center gap-1.5">
                          {item.title}
                          {item.featureKey && <BetaBadge featureKey={`page_${item.featureKey}`} />}
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

              {hasNaitivePipelineAccess && (
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive("/naitive-pipeline")}
                    tooltip="naitive Pipeline"
                  >
                    <NavLink 
                      to="/naitive-pipeline" 
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <Handshake className="h-4 w-4" />
                      {showExpanded && <span>naitive Pipeline</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {hasNaitivePipelineAccess && (
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive("/finserv")}
                    tooltip="FinServ"
                  >
                    <NavLink 
                      to="/finserv" 
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <Landmark className="h-4 w-4" />
                      {showExpanded && <span>FinServ</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
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
