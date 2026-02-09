import * as React from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AISearchWidget } from "@/components/AISearchWidget";
import { cn } from "@/lib/utils";

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
        "min-h-0 min-w-0 flex-1 flex flex-col rounded-xl border border-border/30 shadow-sm overflow-auto",
        "bg-card dark:bg-[linear-gradient(180deg,_hsl(292,46%,72%)_0%,_hsl(280,60%,45%)_30%,_hsl(270,80%,10%)_70%,_hsl(270,100%,2%)_100%)]",
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
      <div className="flex w-full h-full min-h-0 bg-muted/30 dark:bg-[hsl(230,25%,5%)] p-2 gap-1">
        <AppSidebar />
        <MainContent className={mainClassName}>{children}</MainContent>
      </div>
      <AISearchWidget />
      <FeedbackWidget />
    </SidebarProvider>
  );
}

