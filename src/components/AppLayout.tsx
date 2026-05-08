import * as React from "react";
import { useLocation } from "react-router-dom";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TaskAssignmentBanner } from "@/components/TaskAssignmentBanner";
import { PlatformTour } from "@/components/PlatformTour";
import { ClaapRoutingTasksBadge } from "@/components/integrations/claap/ClaapRoutingTasksBadge";
import { CopilotToggleButton } from "@/components/CopilotToggleButton";
import { CommandBar } from "@/components/CommandBar";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  /** Optional override for the main content container (defaults to bg-card). */
  mainClassName?: string;
}

function MainContent({
  children,
  className,
  showCopilotBar,
}: {
  children: React.ReactNode;
  className?: string;
  showCopilotBar: boolean;
}) {
  const { state, setOpen, isMobile } = useSidebar();

  const handleMainClick = () => {
    // Close the sidebar when clicking on main content (only on desktop when expanded)
    if (!isMobile && state === "expanded") {
      setOpen(false);
    }
  };

  return (
    <main
      className={cn(
        "relative min-h-0 min-w-0 flex-1 flex flex-col rounded-xl main-scrollable",
        className,
      )}
      data-tour="workspace"
      style={{
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.15) transparent',
        background: 'rgba(8, 10, 18, 0.10)',
        backdropFilter: 'blur(20px) saturate(1.25) brightness(0.98)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.25) brightness(0.98)',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
        borderRight: '1px solid rgba(255, 255, 255, 0.04)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 1px 0 0 rgba(255,255,255,0.03)',
      }}
      onClick={handleMainClick}
    >
      {/* Noise texture overlay for glass grain */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
        }}
      />
      <div className="relative z-10 flex-1 flex flex-col min-h-full">
        {children}
        {showCopilotBar && <CopilotToggleButton />}
      </div>
    </main>
  );
}

function BodyScrollLock() {
  React.useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlHeight = document.documentElement.style.height;
    const prevBodyHeight = document.body.style.height;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.height = prevHtmlHeight;
      document.body.style.height = prevBodyHeight;
    };
  }, []);

  return null;
}

export function AppLayout({ children, mainClassName }: AppLayoutProps) {
  const location = useLocation();
  const isTasksPage = location.pathname === '/tasks' || location.pathname.startsWith('/tasks/');
  // The dashboard already exposes the primary assistant composer inline,
  // so suppress the floating AI Copilot panel + toggle on that route only.
  const isDashboardPage = location.pathname === '/dashboard';
  return (
    <SidebarProvider defaultOpen={true} className="h-svh" style={{ isolation: 'auto' } as React.CSSProperties}>
      <BodyScrollLock />
      {/* App background — diagonal gradient */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          minHeight: '100vh',
          background:
            'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)',
        }}
      />

      <div className="flex w-full h-full min-h-0 bg-transparent pt-2 pb-2 pl-2 pr-0 gap-1" style={{ isolation: 'auto' }}>
        <AppSidebar />
        <MainContent className={mainClassName} showCopilotBar={!isDashboardPage}>{children}</MainContent>
      </div>
      <TaskAssignmentBanner />
      <PlatformTour />
      <CommandBar />
    </SidebarProvider>
  );
}

