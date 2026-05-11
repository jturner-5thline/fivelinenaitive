import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { SpinningGlobe } from "@/components/SpinningGlobe";

export const HomepageHero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-transparent">
      {/* Globe — scaled down, pushed right. Screen blend so any internal dark fill disappears into the page gradient. */}
      <div
        className="absolute inset-0 flex items-center justify-end overflow-hidden pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      >
        <div className="w-[65%] h-full relative right-[-8%]">
          <SpinningGlobe />
        </div>
      </div>

      {/* Left-aligned, vertically centered content */}
      <div className="relative z-10 container mx-auto px-6 md:px-[8%] lg:px-[10%]">
        <div className="max-w-full md:max-w-[60%] lg:max-w-[50%] flex flex-col items-start gap-2">
          {/* Tagline — shares left edge with the "n" in the wordmark */}
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-[1.15] text-white">
            The Operating System for Deal Management
          </h1>

          {/* CTA — shares left edge with tagline and wordmark "n" */}
          <Button
            size="lg"
            className="marketing-glass-cta mt-6 sm:mt-8 px-8 sm:px-10 py-5 sm:py-6 text-sm sm:text-base font-semibold border-0"
            asChild
          >
            <Link to="/auth">Sign Up</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
