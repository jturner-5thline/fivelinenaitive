import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageHeader = () => (
  <header className="os-header border-b border-border">
    <nav className="os-container flex items-center justify-between gap-4 h-[76px]" aria-label="Main navigation">
      <Link to="/" aria-label="naitive home" className="shrink-0"><img src={naitiveLogoDark} alt="naitive" className="h-[108px] w-auto object-contain" /></Link>
      <Button asChild className="os-primary h-9 px-4 text-sm"><a href="https://naitive.co/login" target="_blank" rel="noopener noreferrer">Log In</a></Button>
    </nav>
  </header>
);
