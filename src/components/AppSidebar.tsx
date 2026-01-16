import { LayoutDashboard, Briefcase, BarChart3, Lightbulb, Users } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";

const menuItems = [
  { title: "Dashboard", url: "/deals", icon: LayoutDashboard },
  { title: "Deals", url: "/deal", icon: Briefcase },
  { title: "Metrics", url: "/analytics", icon: BarChart3 },
  { title: "Insights", url: "/reports", icon: Lightbulb },
  { title: "Sales & BD", url: "/lenders", icon: Users },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (url: string) => {
    if (url === "/deals") return currentPath === "/deals" || currentPath === "/dashboard";
    if (url === "/deal") return currentPath.startsWith("/deal/");
    return currentPath.startsWith(url);
  };

  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border pb-4">
        <div className="flex items-center gap-2 px-2">
          <Logo className="h-6 w-6 flex-shrink-0" />
          {!collapsed && <span className="font-semibold text-sidebar-foreground">5thLine</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
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
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
