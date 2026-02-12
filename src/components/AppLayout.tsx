import * as React from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AISearchWidget } from "@/components/AISearchWidget";
import { GlobalSearchAI } from "@/components/GlobalSearchAI";
import { CreateDealDialog } from "@/components/deals/CreateDealDialog";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        "min-h-0 min-w-0 flex-1 flex flex-col rounded-xl border shadow-sm overflow-auto border-border dark:border-[hsl(263,45%,45%,0.7)] dark:shadow-[0_0_20px_hsl(263,60%,50%,0.12)]",
        "bg-card dark:bg-[radial-gradient(circle_at_bottom_right,_hsl(280,60%,45%,0.2)_0%,_hsl(270,80%,4%)_40%,_hsl(270,100%,2%)_100%)]",
        className,
      )}
      onClick={handleMainClick}
    >
      {/* Persistent top header bar */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border/50 shrink-0">
        <div className="w-64">
          <GlobalSearchAI />
        </div>
        <CreateDealDialog
          trigger={
            <Button size="sm" className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Deal</span>
            </Button>
          }
        />
      </div>
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

