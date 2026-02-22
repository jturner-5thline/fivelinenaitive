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
        "relative min-h-0 min-w-0 flex-1 flex flex-col rounded-xl border shadow-sm overflow-auto border-border dark:border-[hsl(263,45%,45%,0.7)] dark:shadow-[0_0_20px_hsl(263,60%,50%,0.12)]",
        "bg-transparent backdrop-blur-sm",
        className,
      )}
      onClick={handleMainClick}
    >
      <div className="relative z-10 flex-1 flex flex-col">
        {children}
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
  return (
    <SidebarProvider defaultOpen={true} className="h-svh overflow-hidden">
      <BodyScrollLock />
      {/* Liquid glass decorative background — behind all content */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        {/* Ambient glow orbs */}
        <div className="absolute -top-20 -left-20 w-[600px] h-[600px] rounded-full opacity-[0.15]" style={{ background: 'radial-gradient(circle, hsl(282,70%,20%) 0%, transparent 70%)' }} />
        <div className="absolute top-[40%] -right-16 w-[500px] h-[500px] rounded-full opacity-[0.12]" style={{ background: 'radial-gradient(circle, hsl(291,48%,60%) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 left-[20%] w-[600px] h-[400px] rounded-full opacity-[0.12]" style={{ background: 'radial-gradient(ellipse, hsl(286,60%,45%) 0%, transparent 70%)' }} />

        {/* Flowing wave shapes */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lwFill1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(282,70%,10%)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="hsl(282,50%,5%)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="lwFill2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(282,55%,8%)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="hsl(291,40%,4%)" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="lwFill3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(291,50%,10%)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="hsl(282,40%,5%)" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="lwEdge1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(291,60%,70%)" stopOpacity="0.0" />
              <stop offset="30%" stopColor="hsl(291,60%,70%)" stopOpacity="0.7" />
              <stop offset="70%" stopColor="hsl(282,80%,55%)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="hsl(282,80%,55%)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lwEdge2" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(291,60%,70%)" stopOpacity="0.0" />
              <stop offset="25%" stopColor="hsl(291,60%,70%)" stopOpacity="0.6" />
              <stop offset="75%" stopColor="hsl(282,80%,55%)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="hsl(282,80%,55%)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lwEdge3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(282,80%,55%)" stopOpacity="0.0" />
              <stop offset="20%" stopColor="hsl(282,80%,55%)" stopOpacity="0.55" />
              <stop offset="80%" stopColor="hsl(291,60%,70%)" stopOpacity="0.65" />
              <stop offset="100%" stopColor="hsl(291,60%,70%)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="lwBlur"><feGaussianBlur stdDeviation="2" /></filter>
          </defs>
          <path d="M-100,120 C200,80 400,220 720,180 C1040,140 1200,280 1540,200 L1540,0 L-100,0 Z" fill="url(#lwFill1)" />
          <path d="M-100,120 C200,80 400,220 720,180 C1040,140 1200,280 1540,200" fill="none" stroke="url(#lwEdge1)" strokeWidth="1.5" filter="url(#lwBlur)" />
          <path d="M-100,120 C200,80 400,220 720,180 C1040,140 1200,280 1540,200" fill="none" stroke="url(#lwEdge1)" strokeWidth="0.8" opacity="0.8" />
          <path d="M1540,380 C1200,320 1000,480 680,420 C360,360 200,500 -100,440 L-100,900 L1540,900 Z" fill="url(#lwFill2)" />
          <path d="M1540,380 C1200,320 1000,480 680,420 C360,360 200,500 -100,440" fill="none" stroke="url(#lwEdge2)" strokeWidth="1.5" filter="url(#lwBlur)" />
          <path d="M1540,380 C1200,320 1000,480 680,420 C360,360 200,500 -100,440" fill="none" stroke="url(#lwEdge2)" strokeWidth="0.8" opacity="0.8" />
          <path d="M-100,700 C180,640 420,780 740,720 C1060,660 1280,800 1540,740 L1540,900 L-100,900 Z" fill="url(#lwFill3)" />
          <path d="M-100,700 C180,640 420,780 740,720 C1060,660 1280,800 1540,740" fill="none" stroke="url(#lwEdge3)" strokeWidth="1.5" filter="url(#lwBlur)" />
          <path d="M-100,700 C180,640 420,780 740,720 C1060,660 1280,800 1540,740" fill="none" stroke="url(#lwEdge3)" strokeWidth="0.8" opacity="0.8" />
          <path d="M800,50 C1000,100 1150,30 1440,80" fill="none" stroke="url(#lwEdge1)" strokeWidth="1" opacity="0.3" filter="url(#lwBlur)" />
        </svg>
      </div>

      <div className="relative z-10 flex w-full h-full min-h-0 bg-transparent p-2 gap-1">
        <AppSidebar />
        <MainContent className={mainClassName}>{children}</MainContent>
      </div>
      <AISearchWidget />
      <FeedbackWidget />
    </SidebarProvider>
  );
}

