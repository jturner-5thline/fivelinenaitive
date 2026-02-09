import * as React from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AISearchWidget } from "@/components/AISearchWidget";
import { cn } from "@/lib/utils";
import appBackground from "@/assets/app-background.png";

interface AppLayoutProps {
  children: React.ReactNode;
  /** Optional override for the main content container (defaults to bg-card). */
  mainClassName?: string;
}

function MainContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
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
        "min-h-0 min-w-0 flex-1 flex flex-col bg-background/20 backdrop-blur-sm rounded-xl border border-border/30 shadow-sm overflow-auto",
        className,
      )}
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

export function AppLayout({ children, mainClassName }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true} className="h-svh overflow-hidden">
      <BodyScrollLock />
        <div
          className="flex w-full h-full min-h-0 p-2 gap-1 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${appBackground})` }}
        >
        <AppSidebar />
        <MainContent className={mainClassName}>{children}</MainContent>
      </div>
      <AISearchWidget />
      <FeedbackWidget />
    </SidebarProvider>
  );
}

