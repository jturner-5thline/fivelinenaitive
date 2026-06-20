import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageHeader = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const hero = document.querySelector('[data-homepage-hero]') as HTMLElement | null;
      const headerOffset = 80; // approx header height + top offset
      const threshold = hero ? hero.offsetTop + hero.offsetHeight - headerOffset : window.innerHeight - headerOffset;
      setScrolled(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-3 sm:top-5 left-0 right-0 z-50 px-3 sm:px-6 pointer-events-none">
      <header
        className={cn(
          "container mx-auto max-w-6xl rounded-[10px] transition-all duration-300 ease-out pointer-events-auto",
          scrolled
            ? "bg-[rgba(8,10,18,0.72)] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.07] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_30px_-14px_rgba(0,0,0,0.55)]"
            : "bg-transparent border border-transparent"
        )}
      >
        <nav className="pl-2 pr-2 sm:pl-3 sm:pr-3 h-12 sm:h-14 flex items-center justify-between gap-4 leading-none">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 leading-none -ml-1" aria-label="naitive home">
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-16 sm:h-20 w-auto object-contain block -my-4 sm:-my-5"
            style={{ aspectRatio: 'auto' }}
          />
        </Link>

        {/* CTA */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-9 text-white/75 hover:text-white hover:bg-white/[0.06] text-[13px] font-medium tracking-[-0.005em] px-3 sm:px-4 rounded-[8px]"
            asChild
          >
            <Link to="/login">Log in</Link>
          </Button>
          <Button 
            size="sm" 
            className="marketing-glass-cta h-9 border-0 text-[13px] font-semibold tracking-[-0.005em] px-4 sm:px-5 rounded-[8px]"
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
