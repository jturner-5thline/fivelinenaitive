import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";
import { ContactUsDialog } from "./ContactUsDialog";

export const HomepageHeader = () => {
  const [scrolled, setScrolled] = useState(false);
  const [blurred, setBlurred] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const hero = document.querySelector('[data-homepage-hero]') as HTMLElement | null;
      const headerOffset = 80; // approx header height + top offset
      const threshold = hero ? hero.offsetTop + hero.offsetHeight - headerOffset : window.innerHeight - headerOffset;
      setScrolled(window.scrollY > threshold);
      const heading = document.querySelector('[data-homepage-hero] h1') as HTMLElement | null;
      if (heading) {
        const rect = heading.getBoundingClientRect();
        setBlurred(rect.top < headerOffset);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={cn(
      "fixed top-3 sm:top-5 left-0 right-0 z-50 pointer-events-none transition-[padding] duration-300 ease-out",
      scrolled ? "px-3 sm:px-6" : "px-2 sm:px-3"
    )}>
      <header
        className={cn(
          "mx-auto rounded-[10px] transition-all duration-300 ease-out pointer-events-auto",
          scrolled
            ? "container max-w-6xl bg-[rgba(8,10,18,0.72)] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.07] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_30px_-14px_rgba(0,0,0,0.55)]"
            : cn(
                "w-full bg-transparent border border-transparent",
                blurred && "backdrop-blur-md backdrop-saturate-150"
              )
        )}
      >
        <nav className="pl-2 pr-2 sm:pl-3 sm:pr-3 h-12 sm:h-14 flex items-center justify-between gap-4 leading-none">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 leading-none -ml-1" aria-label="naitive home">
          <img
            src={naitiveLogoDark}
            alt="naitive deal management logo"
            className="h-16 sm:h-24 md:h-28 lg:h-[7.5rem] w-auto object-contain block -my-5 sm:-my-8 md:-my-9 lg:-my-10"
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
          <ContactUsDialog>
            <Button
              size="sm"
              className="marketing-glass-cta h-9 border-0 text-[13px] font-semibold tracking-[-0.005em] px-4 sm:px-5 rounded-[8px]"
            >
              Contact Us
            </Button>
          </ContactUsDialog>
        </div>
        </nav>
      </header>
    </div>
  );
};
