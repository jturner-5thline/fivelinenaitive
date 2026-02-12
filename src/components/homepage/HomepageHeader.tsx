import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const HomepageHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
      <div className="container mx-auto px-6 h-16 flex items-center justify-end">
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
            className="bg-gradient-to-r from-[hsl(280,60%,50%)] via-[hsl(260,60%,45%)] to-[hsl(240,50%,30%)] text-white hover:opacity-90 border border-white/10"
            asChild
          >
            <Link to="/waitlist">Contact Us</Link>
          </Button>
        </div>
      </div>
    </header>
  );
};
