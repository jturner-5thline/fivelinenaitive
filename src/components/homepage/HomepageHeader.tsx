import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";
import { BookDemoDialog } from "./BookDemoDialog";

export const HomepageHeader = () => (
  <header className="os-header border-b border-border">
    <nav className="os-container flex items-center justify-between gap-4 h-[76px]" aria-label="Main navigation">
      <Link to="/" aria-label="naitive home" className="shrink-0"><img src={naitiveLogoDark} alt="naitive" className="h-20 w-auto object-contain" /></Link>
      <div className="hidden md:flex gap-7 text-sm text-muted-foreground"><a className="hover:text-foreground transition-colors" href="#platform">Platform</a><a className="hover:text-foreground transition-colors" href="#built-for">Who it’s for</a></div>
      <BookDemoDialog><Button className="os-primary h-9 px-4 text-sm">Book a Demo<ArrowRight /></Button></BookDemoDialog>
    </nav>
  </header>
);
