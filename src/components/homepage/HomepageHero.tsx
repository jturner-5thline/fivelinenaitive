import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { SpinningGlobe } from "@/components/SpinningGlobe";
import { Logo } from "@/components/Logo";

export const HomepageHero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_bottom_right,_hsl(280,60%,45%,0.2)_0%,_hsl(270,80%,4%)_40%,_hsl(270,100%,2%)_100%)]">
      {/* Spinning Globe Background */}
      <div className="absolute inset-0 blur-[2px]"><SpinningGlobe /></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a12]" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 text-center pt-10">
        <Logo className="h-32 md:h-44 lg:h-48 mx-auto mb-4" />

        <h1 className="text-xl md:text-2xl lg:text-3xl font-light text-white mb-8 max-w-4xl mx-auto leading-[1.1]">
          The Operating System for Deal Management
        </h1>


        <Button 
          size="lg" 
          className="bg-gradient-to-r from-[hsl(280,60%,50%)] via-[hsl(260,60%,45%)] to-[hsl(240,50%,30%)] text-white hover:opacity-90 px-8 py-6 text-base border border-white/10"
          asChild
        >
          <Link to="/waitlist">Learn More</Link>
        </Button>
      </div>
    </section>
  );
};
