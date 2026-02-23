import * as React from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FeedbackWidget } from "@/components/FeedbackWidget";
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
        "relative min-h-0 min-w-0 flex-1 flex flex-col rounded-xl border overflow-auto border-[hsl(263,40%,25%,0.6)] shadow-[inset_0_1px_1px_hsl(263,40%,35%,0.08),0_4px_24px_hsl(0,0%,0%,0.4)]",
        "bg-transparent backdrop-blur-sm before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(315deg,hsl(263,40%,30%,0.08)_0%,transparent_50%,hsl(263,30%,20%,0.04)_100%)]",
        className,
      )}
      onClick={handleMainClick}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 rounded-t-xl z-0" style={{ background: 'linear-gradient(to bottom, hsl(282,40%,6%,0.75) 0%, hsl(282,40%,6%,0.4) 40%, transparent 100%)' }} />
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
        <div className="absolute -top-20 -left-20 w-[600px] h-[600px] rounded-full opacity-[0.14]" style={{ background: 'radial-gradient(circle, hsl(268,75%,28%) 0%, hsl(272,60%,16%) 45%, transparent 70%)' }} />
        <div className="absolute top-[40%] right-[10%] w-[400px] h-[400px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, hsl(278,80%,42%) 0%, hsl(270,65%,24%) 50%, transparent 70%)' }} />
        <div className="absolute -bottom-20 left-[30%] w-[500px] h-[400px] rounded-full opacity-[0.10]" style={{ background: 'radial-gradient(ellipse, hsl(275,75%,34%) 0%, hsl(268,60%,18%) 50%, transparent 70%)' }} />

        {/* Flowing wave shapes */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lwFill1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(268,72%,16%)" stopOpacity="0.9" />
              <stop offset="50%" stopColor="hsl(272,60%,10%)" stopOpacity="0.75" />
              <stop offset="100%" stopColor="hsl(275,55%,6%)" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="lwFill2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(275,68%,14%)" stopOpacity="0.8" />
              <stop offset="50%" stopColor="hsl(270,58%,9%)" stopOpacity="0.65" />
              <stop offset="100%" stopColor="hsl(268,48%,5%)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="lwFill3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(272,68%,15%)" stopOpacity="0.8" />
              <stop offset="50%" stopColor="hsl(270,55%,9%)" stopOpacity="0.65" />
              <stop offset="100%" stopColor="hsl(268,48%,5%)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="lwEdge1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(272,100%,80%)" stopOpacity="0.0" />
              <stop offset="30%" stopColor="hsl(272,100%,80%)" stopOpacity="0.95" />
              <stop offset="70%" stopColor="hsl(268,100%,70%)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="hsl(268,100%,70%)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lwEdge2" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(272,100%,80%)" stopOpacity="0.0" />
              <stop offset="25%" stopColor="hsl(272,100%,80%)" stopOpacity="0.9" />
              <stop offset="75%" stopColor="hsl(268,100%,70%)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="hsl(268,100%,70%)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lwEdge3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(268,100%,70%)" stopOpacity="0.0" />
              <stop offset="20%" stopColor="hsl(268,100%,70%)" stopOpacity="0.8" />
              <stop offset="80%" stopColor="hsl(272,100%,80%)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="hsl(272,100%,80%)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="lwBlur"><feGaussianBlur stdDeviation="0.5" /></filter>
          </defs>
          <path d="M-100,120 C200,80 400,220 720,180 C1040,140 1200,280 1540,200 L1540,0 L-100,0 Z" fill="url(#lwFill1)" />
          <path d="M-100,120 C200,80 400,220 720,180 C1040,140 1200,280 1540,200" fill="none" stroke="url(#lwEdge1)" strokeWidth="2.5" filter="url(#lwBlur)" />
          <path d="M-100,120 C200,80 400,220 720,180 C1040,140 1200,280 1540,200" fill="none" stroke="url(#lwEdge1)" strokeWidth="1.5" opacity="1" />
          <path d="M1540,380 C1200,320 1000,480 680,420 C360,360 200,500 -100,440 L-100,900 L1540,900 Z" fill="url(#lwFill2)" />
          <path d="M1540,380 C1200,320 1000,480 680,420 C360,360 200,500 -100,440" fill="none" stroke="url(#lwEdge2)" strokeWidth="2.5" filter="url(#lwBlur)" />
          <path d="M1540,380 C1200,320 1000,480 680,420 C360,360 200,500 -100,440" fill="none" stroke="url(#lwEdge2)" strokeWidth="1.5" opacity="1" />
          <path d="M-100,700 C180,640 420,780 740,720 C1060,660 1280,800 1540,740 L1540,900 L-100,900 Z" fill="url(#lwFill3)" />
          <path d="M-100,700 C180,640 420,780 740,720 C1060,660 1280,800 1540,740" fill="none" stroke="url(#lwEdge3)" strokeWidth="2.5" filter="url(#lwBlur)" />
          <path d="M-100,700 C180,640 420,780 740,720 C1060,660 1280,800 1540,740" fill="none" stroke="url(#lwEdge3)" strokeWidth="1.5" opacity="1" />
          <path d="M800,50 C1000,100 1150,30 1440,80" fill="none" stroke="url(#lwEdge1)" strokeWidth="2" opacity="0.7" />
        </svg>
      </div>

      <div className="relative z-10 flex w-full h-full min-h-0 bg-transparent p-2 gap-1">
        <AppSidebar />
        <MainContent className={mainClassName}>{children}</MainContent>
      </div>
      <FeedbackWidget />
    </SidebarProvider>
  );
}

