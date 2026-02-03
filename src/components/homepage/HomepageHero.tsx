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
      <div className="relative z-10 container mx-auto px-6 text-center pt-20">
        <Logo className="h-32 md:h-44 lg:h-48 mx-auto mb-8" />

        <h1 className="text-2xl md:text-3xl lg:text-4xl font-light text-white mb-6 max-w-4xl mx-auto leading-[1.1]">
          Welcome to the Operating Layer{" "}
          <br className="hidden md:block" />
          <span className="bg-gradient-to-r from-white via-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
            for Deal Management.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          Purpose-built AI that helps advisors and lenders work smarter, 
          move faster, and close more deals
        </p>

        <Button 
          size="lg" 
          className="bg-white text-primary hover:bg-white/90 px-8 py-6 text-base"
          asChild
        >
          <Link to="/waitlist">Request a Demo</Link>
        </Button>
      </div>

      {/* Trusted by section */}
      <div className="absolute bottom-16 left-0 right-0 z-10">
        <div className="container mx-auto px-6">
          <p className="text-center text-white/40 text-sm mb-6">
            Trusted by leading financial institutions
          </p>
        </div>
      </div>
    </section>
  );
};
