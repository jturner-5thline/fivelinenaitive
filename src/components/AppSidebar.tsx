import { LayoutDashboard, Briefcase, BarChart3, Lightbulb, Users, Settings, User, LogOut, HelpCircle, ShieldCheck, Plug, Newspaper, UserCog, Cog, Sparkles, Workflow, Bot, DollarSign } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { usePageAccessFlags } from "@/hooks/useFeatureFlags";
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
  { title: "Deals", url: "/deals", icon: Briefcase, featureKey: null }, // Always visible
  { title: "News Feed", url: "/news-feed", icon: Newspaper, featureKey: "newsfeed" },
  { title: "AI Research", url: "/research", icon: Sparkles, featureKey: null }, // Always visible
  { title: "AI Agents", url: "/agents", icon: Bot, featureKey: "agents" },
  { title: "Metrics", url: "/metrics", icon: BarChart3, featureKey: "metrics" },
  { title: "Insights", url: "/insights", icon: Lightbulb, featureKey: "insights" },
  { title: "Sales & BD", url: "/sales-bd", icon: Users, featureKey: "sales_bd" },
  { title: "HR", url: "/hr", icon: UserCog, featureKey: "hr" },
  { title: "Operations", url: "/operations", icon: Cog, featureKey: "operations" },
  { title: "Finance", url: "/finance", icon: DollarSign, featureKey: "finance" },
];

const footerItems = [
  { title: "Workflows", url: "/workflows", icon: Workflow, featureKey: "workflows" },
  { title: "Integrations", url: "/integrations", icon: Plug, featureKey: "integrations" },
  { title: "Settings", url: "/settings", icon: Settings, featureKey: null }, // Always visible
  { title: "Help", url: "/help", icon: HelpCircle, featureKey: null }, // Always visible
];

export function AppSidebar() {
  const { state, isHovering } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminRole();
  const { hasPageAccess } = usePageAccessFlags();
  const currentPath = location.pathname;
  // Show expanded content if either actually expanded or hovering while collapsed
  const showExpanded = state === "expanded" || (state === "collapsed" && isHovering);
  
  // Filter menu items based on feature access
  const visibleMenuItems = menuItems.filter(item => 
    item.featureKey === null || hasPageAccess(item.featureKey)
  );
  
  const visibleFooterItems = footerItems.filter(item =>
    item.featureKey === null || hasPageAccess(item.featureKey)
  );

  const isActive = (url: string) => {
    if (url === "/dashboard") return currentPath === "/dashboard";
    if (url === "/deals") return currentPath === "/deals";
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
      <SidebarHeader className="border-b border-sidebar-border px-2 py-3">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="h-9 w-9 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shadow-sm transition-all" />
          {showExpanded && <span className="font-semibold text-sidebar-foreground">5thLine</span>}
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
                      <item.icon className="h-4 w-4" />
                      {showExpanded && <span>{item.title}</span>}
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
                  <item.icon className="h-4 w-4" />
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
                <DropdownMenuItem onClick={() => navigate("/account")}>
                  <User className="mr-2 h-4 w-4" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
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
