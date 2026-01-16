import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo } from "@/components/Logo";
import { AppBreadcrumb } from "@/components/AppBreadcrumb";
import { Separator } from "@/components/ui/separator";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="sticky top-0 z-40 flex h-12 items-center border-b bg-background px-4 gap-3">
            <SidebarTrigger />
            <div className="flex items-center gap-1.5">
              <Logo className="text-lg" />
            </div>
            <Separator orientation="vertical" className="h-4" />
            <AppBreadcrumb />
          </div>
          <div className="flex-1">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
