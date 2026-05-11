import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-sm border-b border-white/5">
      <nav className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0" aria-label="naitive home">
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-7 sm:h-8 w-auto object-contain"
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
