import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { SpinningGlobe } from "@/components/SpinningGlobe";
import { Logo } from "@/components/Logo";

export const HomepageHero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#010114]">
      {/* Spinning Globe Background */}
      <SpinningGlobe />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a12]" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 text-center pt-10">
        <Logo className="h-32 md:h-44 lg:h-48 mx-auto mb-4" />

        <h1 className="text-xl md:text-2xl lg:text-3xl font-light text-white mb-3 max-w-4xl mx-auto leading-[1.1]">
          The Operating System{" "}
          <span className="bg-gradient-to-r from-white via-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
            for Deal Management
          </span>
        </h1>


        <Button 
          size="lg" 
          className="bg-white text-primary hover:bg-white/90 px-8 py-6 text-base"
          asChild
        >
          <Link to="/waitlist">Learn More</Link>
        </Button>
      </div>
    </section>
  );
};
