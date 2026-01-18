import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FeedbackWidget } from "@/components/FeedbackWidget";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full bg-muted/30 p-2 pl-0 gap-[3px]">
        <AppSidebar />
        <main className="flex-1 flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden h-[calc(100vh-1rem)]">
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
      <FeedbackWidget />
    </SidebarProvider>
  );
}
