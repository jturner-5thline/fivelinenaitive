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
            ? "bg-[linear-gradient(180deg,rgba(18,22,36,0.92)_0%,rgba(6,10,20,0.88)_100%)] backdrop-blur-lg border border-white/15 shadow-[0_10px_32px_rgba(0,0,0,0.5)]"
            : "bg-[linear-gradient(180deg,rgba(16,20,32,0.7)_0%,rgba(6,10,20,0.6)_100%)] backdrop-blur-md border border-white/12 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
        )}
      >
        <nav className="px-4 sm:px-6 py-1.5 flex items-center justify-between gap-4 leading-none">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 leading-none" aria-label="naitive home">
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-20 sm:h-24 w-auto object-contain block -my-5 sm:-my-6"
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
    </div>
  );
};
