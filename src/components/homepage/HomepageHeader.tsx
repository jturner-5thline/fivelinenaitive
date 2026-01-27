import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export const HomepageHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/homepage" className="group">
          <Logo className="text-xl text-white" />
        </Link>

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
            className="bg-white text-primary hover:bg-white/90"
            asChild
          >
            <Link to="/waitlist">Request Demo</Link>
          </Button>
        </div>
      </div>
    </header>
  );
};
