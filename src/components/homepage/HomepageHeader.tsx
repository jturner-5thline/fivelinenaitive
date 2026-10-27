import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageHeader = () => (
  <header className="os-header border-b border-border">
    <nav className="os-container flex items-center justify-between gap-4 h-[76px]" aria-label="Main navigation">
      <Link to="/" aria-label="naitive by 5th Line home" className="shrink-0 flex items-center">
        <img src={naitiveLogoDark} alt="naitive" className="h-[108px] w-auto object-contain -mr-[28px]" />
        <span className="self-center mt-[22px] whitespace-nowrap text-[13px] font-medium leading-none tracking-wide text-muted-foreground">by <span className="text-foreground">5th Line</span></span>
      </Link>
      <Button asChild className="os-primary h-9 px-4 text-sm"><a href="https://naitive.co/login" target="_blank" rel="noopener noreferrer">Log In</a></Button>
    </nav>
  </header>
);
