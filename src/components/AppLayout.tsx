import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TaskAssignmentBanner } from "@/components/TaskAssignmentBanner";
import { PlatformTour } from "@/components/PlatformTour";
import { ClaapRoutingTasksBadge } from "@/components/integrations/claap/ClaapRoutingTasksBadge";
import { CopilotToggleButton } from "@/components/CopilotToggleButton";
import { CommandBar } from "@/components/CommandBar";
import { DealsHeader } from "@/components/deals/DealsHeader";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";
import { useDailyRundownNotification } from "@/hooks/useDailyRundownNotification";
import { useEndOfDayRundownNotification } from "@/hooks/useEndOfDayRundownNotification";

interface AppLayoutProps {
  /**
   * Optional explicit children. When omitted, the layout renders the
   * matched nested route via `<Outlet />`. The Outlet pattern keeps the
   * sidebar, header, providers, and background mounted across navigations
   * — the single biggest perceived-perf win for in-app routing.
   */
  children?: React.ReactNode;
  /** Optional override for the main content container (defaults to bg-card). */
  mainClassName?: string;
}

function MainContent({
  children,
  className,
  showCopilotBar,
  showWorkspaceLogo,
}: {
  children: React.ReactNode;
  className?: string;
  showCopilotBar: boolean;
  showWorkspaceLogo: boolean;
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
        // Keep the main shell cheap to composite while the sidebar width
        // animates; backdrop blur here repaints the largest app surface.
        background: 'rgba(8, 10, 18, 0.28)',
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
      <DealsHeader />
      {showWorkspaceLogo && (
        <div
          className="absolute left-3 sm:left-4 -top-[20px] z-20 pointer-events-none"
          aria-hidden="true"
        >
          <Logo className="h-28" />
        </div>
      )}
      <div className="relative z-10 flex-1 flex flex-col min-h-full pt-[68px]">
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
  // Push the "Your Daily Rundown is Ready" chat notification at most once
  // per business day (eligibility is enforced inside the hook).
  useDailyRundownNotification();
  // Push the "Your End of Day Briefing is Ready" chat notification at most
  // once per local business day (eligibility enforced inside the hook).
  useEndOfDayRundownNotification();
  const content = children ?? <Outlet />;
  const isTasksPage = location.pathname === '/tasks' || location.pathname.startsWith('/tasks/');
  // When the route is loaded inside the Naitive deal overlay iframe
  // (`?embedded=1`), strip the app shell — sidebar, banners, command bar —
  // so the modal feels like a focused content canvas, not a nested page.
  const isEmbedded = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('embedded') === '1';
  }, [location.search]);
  // The dashboard already exposes the primary assistant composer inline,
  // so suppress the floating AI Copilot panel + toggle on that route only.

  // Log a page_view activity event whenever the route changes.
  React.useEffect(() => {
    logActivity({
      event_type: "page_view",
      event_data: { path: location.pathname, search: location.search || undefined },
    });
  }, [location.pathname, location.search]);

  // Track per-page dwell time. On route change (or unmount) emit a
  // `page_dwell` event with the seconds spent on the previous path. This
  // powers the admin "session heatmap" view for demo accounts.
  const dwellStartRef = React.useRef<number>(Date.now());
  const dwellPathRef = React.useRef<string>(location.pathname);
  React.useEffect(() => {
    const previousPath = dwellPathRef.current;
    const previousStart = dwellStartRef.current;
    return () => {
      const seconds = Math.round((Date.now() - previousStart) / 1000);
      // Ignore <2s flash navigations to keep noise low.
      if (seconds >= 2 && seconds < 60 * 60) {
        logActivity({
          event_type: "feature_used",
          event_data: { feature: "page_dwell", path: previousPath, seconds },
        });
      }
      dwellPathRef.current = location.pathname;
      dwellStartRef.current = Date.now();
    };
  }, [location.pathname]);

  // Routes that render the persistent naitive logo brand anchor in the
  // top-left of the main content module. Keep this as a single source of
  // truth so target pages stay visually consistent without per-page edits.
  const WORKSPACE_LOGO_ROUTES = [
    '/deals',
    '/lenders',
    '/contacts',
    '/crm-companies',
    '/agents',
    '/insights',
    '/sales-bd',
    '/wf',
    '/naitive-pipeline',
    '/finserv',
  ];
  const showWorkspaceLogo = WORKSPACE_LOGO_ROUTES.some(
    (r) => location.pathname === r || location.pathname.startsWith(`${r}/`),
  );

  if (isEmbedded) {
    return (
      // Still wrap in SidebarProvider so descendants that call `useSidebar()`
      // (e.g. DealDetail) don't crash when rendered inside the deal overlay
      // iframe. The actual <AppSidebar /> chrome is intentionally omitted.
      // Use h-full (not h-svh) so the embedded shell sizes to its parent
      // (the deal-popup modal), making <main> a properly bounded scroll
      // container. This lets a sticky bottom bar inside DealDetail pin to
      // the modal's bottom edge instead of the viewport bottom.
      // SidebarProvider's wrapper has `min-h-svh` baked in, which forces
      // the embedded shell taller than the deal modal and breaks the
      // bounded scroll container. Override with `!min-h-0` so `<main>`
      // can size to the modal and become the actual scroll region.
      <SidebarProvider defaultOpen={false} className="!min-h-0 h-full" style={{ isolation: 'auto' } as React.CSSProperties}>
        <div className="h-full w-full min-h-0 overflow-hidden bg-transparent flex flex-col">
          <BodyScrollLock />
          <main
            className={cn('relative flex flex-1 min-h-0 w-full flex-col overflow-hidden bg-background', mainClassName)}
            data-tour="workspace"
          >
            {content}
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider defaultOpen={false} className="h-svh" style={{ isolation: 'auto' } as React.CSSProperties}>
      <BodyScrollLock />
      {/* App background — diagonal gradient */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          minHeight: '100vh',
          background:
            'linear-gradient(180deg, #030310 0%, #031026 15%, #05264a 35%, #073b6c 55%, #065193 75%, #0760ae 90%, #046cc1 100%)',
        }}
      />

      <div className="flex w-full h-full min-h-0 bg-transparent pt-2 pb-2 pl-2 pr-0 gap-1" style={{ isolation: 'auto' }}>
        <AppSidebar />
        <MainContent
          className={mainClassName}
          showCopilotBar={true}
          showWorkspaceLogo={showWorkspaceLogo}
        >
          {content}
        </MainContent>
      </div>
      <TaskAssignmentBanner />
      <PlatformTour />
      <CommandBar />
    </SidebarProvider>
  );
}

