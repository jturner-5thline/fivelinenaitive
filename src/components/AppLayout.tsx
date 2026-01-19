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
      className="flex-1 flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden h-[calc(100vh-1rem)]"
      onClick={handleMainClick}
    >
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </main>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex w-full bg-muted/30 p-2 gap-1 h-[calc(100vh-0px)]">
        <AppSidebar />
        <MainContent>{children}</MainContent>
      </div>
      <FeedbackWidget />
    </SidebarProvider>
  );
}
