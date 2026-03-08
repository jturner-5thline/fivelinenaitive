import { LayoutDashboard, Briefcase, BarChart3, Lightbulb, Users, Settings, User, LogOut, HelpCircle, ShieldCheck, Plug, Newspaper, UserCog, Cog, Workflow, Bot, DollarSign, Menu, CheckSquare, Compass, Video, UserPen, SlidersHorizontal, Contact, Building2, Mail } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Map page URLs to feature flag names
const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, featureKey: "dashboard" },
  { title: "Tasks", url: "/tasks", icon: CheckSquare, featureKey: null }, // Always visible
  { title: "Deals", url: "/deals", icon: Briefcase, featureKey: null }, // Always visible
  { title: "Contacts", url: "/contacts", icon: Contact, featureKey: "sales_bd" },
  { title: "Companies", url: "/crm-companies", icon: Building2, featureKey: "sales_bd" },
  { title: "News Feed", url: "/news-feed", icon: Newspaper, featureKey: "newsfeed" },
  { title: "AI Research", url: "/research", icon: Sparkles, featureKey: "ai_research", iconClassName: "h-[18px] w-[18px]" },
  { title: "AI Agents", url: "/agents", icon: Bot, featureKey: "agents" },
  { title: "Metrics", url: "/metrics", icon: BarChart3, featureKey: "metrics" },
  { title: "Insights", url: "/insights", icon: Lightbulb, featureKey: "insights" },
  { title: "Sales & BD", url: "/sales-bd", icon: Users, featureKey: "sales_bd" },
  { title: "HR", url: "/hr", icon: UserCog, featureKey: "hr" },
  { title: "Operations", url: "/operations", icon: Cog, featureKey: "operations" },
  { title: "Finance", url: "/finance", icon: DollarSign, featureKey: "finance" },
  { title: "Email Designer", url: "/email-designer", icon: Mail, featureKey: null },
  { title: "Video Library", url: "/video-library", icon: Video, featureKey: null },
  { title: "WF Deals", url: "/wf-deals", icon: Briefcase, featureKey: null },
  { title: "WF Tasks", url: "/wf-tasks", icon: CheckSquare, featureKey: null },
];

const footerItems = [
  { title: "Workflows", url: "/workflows", icon: Workflow, featureKey: "workflows" },
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
  const { data: routingTasks = [] } = useClaapRoutingTasks();
  const meetingTaskCount = routingTasks.length;
  const { data: pendingJoinCount = 0 } = usePendingJoinRequestCount();
  const currentPath = location.pathname;
  // Show expanded content if either actually expanded or hovering while collapsed
  const showExpanded = state === "expanded" || (state === "collapsed" && isHovering);
  const iconSrc = resolvedTheme === "dark" ? naitiveIconDark : naitiveIconLight;
  
  // Filter menu items based on feature access — while loading, only show items with no feature gate
  const visibleMenuItems = menuItems.filter(item => 
    item.featureKey === null || (!isAccessLoading && hasPageAccess(item.featureKey))
  );
  
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

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || "U";

  return (
    <Sidebar side="left" collapsible="icon" className="h-[calc(100vh-1rem)]">
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
              {visibleMenuItems.map((item) => (
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
                    >
                      <div className="relative">
                        <item.icon className={item.iconClassName || "h-4 w-4"} />
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
              ))}
              
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {visibleFooterItems.map((item) => (
            <SidebarMenuItem key={item.title}>
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
            </SidebarMenuItem>
          ))}
          
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip="Profile" className="cursor-pointer">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src="" />
                    <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  {showExpanded && (
                    <span className="truncate">{user?.email || "Profile"}</span>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/preferences?section=profile")}>
                  <UserPen className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/account")}>
                  <User className="mr-2 h-4 w-4" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/preferences")}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Preferences
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.dispatchEvent(new Event('restart-platform-tour'))}>
                  <Compass className="mr-2 h-4 w-4" />
                  Take a tour
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
