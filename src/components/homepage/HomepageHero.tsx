import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { SpinningGlobe } from "@/components/SpinningGlobe";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";
import heroGlassBg from "@/assets/hero-glass-bg.jpg";

export const HomepageHero = () => {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[hsl(270,80%,4%)]"
      style={{
        backgroundImage: `url(${heroGlassBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Tint overlay — darkens left side for wordmark legibility, keeps globe crisp */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,13,25,0.57) 0%, rgba(10,13,25,0.37) 55%, rgba(10,13,25,0.25) 100%)",
          zIndex: 1,
        }}
      />

      {/* Globe — scaled down, pushed right */}
      <div className="absolute inset-0 flex items-center justify-end overflow-hidden">
        <div className="w-[65%] h-full relative right-[-8%]">
          <SpinningGlobe />
        </div>
      </div>

      {/* Bottom fade — soft blend into page background, no hard edge */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[hsl(268,40%,7%)] pointer-events-none" />

      {/* Left-aligned, vertically centered content */}
      <div className="relative z-10 container mx-auto px-6 md:px-[8%] lg:px-[10%]">
        <div className="max-w-full md:max-w-[60%] lg:max-w-[50%] flex flex-col items-start gap-2">
          {/* Wordmark — negative left margin so the dot-ring bleeds left while the "n" aligns with text below */}
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-32 sm:h-48 md:h-72 lg:h-80 -ml-8 sm:-ml-12 md:-ml-[5.5rem] lg:-ml-24 -mb-6 sm:-mb-10 md:-mb-14"
          />

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
            <Link to="/waitlist">Request Access</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
