import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageHeader = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out",
        scrolled
          ? "bg-[rgba(4,8,18,0.72)] backdrop-blur-md border-b border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
          : "bg-transparent backdrop-blur-sm border-b border-white/5"
      )}
    >
      <nav className="container mx-auto px-4 sm:px-6 h-24 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0" aria-label="naitive home">
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-20 sm:h-24 w-auto object-contain"
            style={{ aspectRatio: 'auto' }}
          />
        </Link>

        {/* CTA */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white/80 hover:text-white hover:bg-white/10"
            asChild
          >
            <Link to="/login">Log in</Link>
          </Button>
          <Button 
            size="sm" 
            className="marketing-glass-cta border-0"
            asChild
          >
            <Link to="/waitlist">Contact Us</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
};
