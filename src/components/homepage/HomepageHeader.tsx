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
    <div className="fixed top-3 sm:top-4 left-0 right-0 z-50 px-3 sm:px-6 pointer-events-none">
      <header
        className={cn(
          "container mx-auto rounded-2xl transition-all duration-300 ease-out pointer-events-auto",
          scrolled
            ? "bg-[rgba(8,10,18,0.78)] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.08] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_30px_-12px_rgba(0,0,0,0.6)]"
            : "bg-[rgba(8,10,18,0.45)] backdrop-blur-md backdrop-saturate-150 border border-white/[0.06] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-14px_rgba(0,0,0,0.45)]"
        )}
      >
        <nav className="pl-1 pr-3 sm:pl-2 sm:pr-5 py-1.5 flex items-center justify-between gap-4 leading-none">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 leading-none" aria-label="naitive home">
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-20 sm:h-24 w-auto object-contain block -my-5 sm:-my-6 -ml-3 sm:-ml-4"
            style={{ aspectRatio: 'auto' }}
          />
        </Link>

        {/* CTA */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white/75 hover:text-white hover:bg-white/[0.06] text-[13px] font-medium tracking-[-0.005em] px-3 sm:px-4"
            asChild
          >
            <Link to="/login">Log in</Link>
          </Button>
          <Button 
            size="sm" 
            className="marketing-glass-cta border-0 text-[13px] font-semibold tracking-[-0.005em] px-4 sm:px-5"
            asChild
          >
            <Link to="/waitlist">Contact Us</Link>
          </Button>
        </div>
        </nav>
      </header>
    </div>
  );
};
