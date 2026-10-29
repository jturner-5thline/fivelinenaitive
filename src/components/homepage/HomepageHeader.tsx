import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { BookDemoDialog } from "./BookDemoDialog";

export const HomepageHeader = () => {
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    const target = document.querySelector("[data-hero-demo]");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowDemo(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: "-76px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="os-header sticky top-0 z-50">
      <nav className="os-container flex items-center justify-between gap-4 h-[76px]" aria-label="Main navigation">
        <Link to="/" aria-label="naitive by 5th Line home" className="shrink-0 flex items-center gap-2">
          <Logo className="h-7 sm:h-10" />
          <span className="hidden sm:inline self-center mt-3 whitespace-nowrap text-[13px] font-medium leading-none tracking-wide text-muted-foreground">by <span className="text-foreground">5th Line</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <div
            className={`os-header-demo ${showDemo ? "is-visible" : ""}`}
            aria-hidden={!showDemo}
          >
            <BookDemoDialog>
              <Button variant="outline" className="os-secondary h-9 px-4 text-sm whitespace-nowrap" tabIndex={showDemo ? 0 : -1}>Book a Demo</Button>
            </BookDemoDialog>
          </div>
          <Button asChild variant="outline" className="os-secondary h-9 px-4 text-sm whitespace-nowrap"><a href="https://www.5thline.co" target="_blank" rel="noopener noreferrer">Visit 5th Line</a></Button>
          <Button asChild className="os-primary h-9 px-4 text-sm"><Link to="/login">Log In</Link></Button>
        </div>
      </nav>
    </header>
  );
};
