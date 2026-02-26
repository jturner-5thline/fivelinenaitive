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
        <Logo className="h-96 md:h-[33rem] lg:h-[36rem] mx-auto mb-0" />

        <h1 className="text-xl md:text-2xl lg:text-3xl font-light text-white mb-5 max-w-4xl mx-auto leading-[1.1] -mt-24">
          The Operating System for Deal Management
        </h1>


        <Button 
          size="lg" 
          variant="liquid-glass"
          className="px-8 py-6 text-base text-white"
          asChild
        >
          <Link to="/waitlist">Learn More</Link>
        </Button>
      </div>
    </section>
  );
};
