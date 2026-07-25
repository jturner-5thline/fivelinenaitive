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
        // Fully transparent intermediate shell so deal tiles sit directly
        // on the app-wide gradient background — no fill, border, or overlay.
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
      }}
      onClick={handleMainClick}
    >
      {/* Noise overlay removed — intermediate shell is fully transparent. */}
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
  const isDealsRoute = location.pathname === '/deals' || location.pathname.startsWith('/deals/');

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
            'linear-gradient(180deg, #030310 0%, #030b1e 10%, #051a39 25%, #063765 50%, #065193 75%, #076cc1 100%)',
        }}
      />

      <div
        className={cn(
          'flex w-full h-full min-h-0 bg-transparent pt-2 pl-2 pr-0 gap-1',
          isDealsRoute ? 'pb-0' : 'pb-2',
        )}
        style={{ isolation: 'auto' }}
      >
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

