import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const HomepageHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Nav links */}
        <nav className="flex items-center gap-6">
          <a href="#product" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Product
          </a>
          <a href="#features" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Features
          </a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white/80 hover:text-white hover:bg-white/10"
            asChild
          >
            <Link to="/waitlist">Log in</Link>
          </Button>
          <Button 
            size="sm" 
            className="bg-[hsl(270,65%,50%)] text-white hover:bg-[hsl(270,65%,45%)] border-0"
            asChild
          >
            <Link to="/waitlist">Contact Us</Link>
          </Button>
        </div>
      </div>
    </header>
  );
};
