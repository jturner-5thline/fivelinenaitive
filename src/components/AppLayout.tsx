import * as React from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FeedbackWidget } from "@/components/FeedbackWidget";

interface AppLayoutProps {
  children: React.ReactNode;
}

function MainContent({ children }: { children: React.ReactNode }) {
  const { state, setOpen, isMobile } = useSidebar();

  const handleMainClick = () => {
    // Close the sidebar when clicking on main content (only on desktop when expanded)
    if (!isMobile && state === "expanded") {
      setOpen(false);
    }
  };

  return (
    <main
      className="min-h-0 flex-1 flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-auto"
      onClick={handleMainClick}
    >
      {children}
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

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true} className="h-svh overflow-hidden">
      <BodyScrollLock />
      <div className="flex w-full h-full min-h-0 bg-muted/30 p-2 gap-1">
        <AppSidebar />
        <MainContent>{children}</MainContent>
      </div>
      <FeedbackWidget />
    </SidebarProvider>
  );
}

