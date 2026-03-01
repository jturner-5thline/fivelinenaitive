import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { SpinningGlobe } from "@/components/SpinningGlobe";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageHero = () => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[radial-gradient(circle_at_bottom_right,_hsl(280,60%,45%,0.2)_0%,_hsl(270,80%,4%)_40%,_hsl(270,100%,2%)_100%)]">
      {/* Globe — anchored right, partially bleeding off-screen */}
      <div className="absolute inset-0 blur-[2px]" style={{ transform: 'translateX(15%)' }}>
        <SpinningGlobe />
      </div>

      {/* Purple radial glow behind globe */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '70vw',
          height: '70vh',
          right: '-5%',
          top: '15%',
          background: 'radial-gradient(ellipse at center, hsl(270 60% 50% / 0.18) 0%, transparent 70%)',
        }}
      />

      {/* Bottom fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a12]" />

      {/* Left-aligned content */}
      <div className="relative z-10 container mx-auto px-6 md:px-[8%] lg:px-[10%]">
        <div className="max-w-[50%] flex flex-col items-start gap-10">
          {/* Wordmark — reduced ~20-25% */}
          <img
            src={naitiveLogoDark}
            alt="naitive"
            className="h-60 md:h-72 lg:h-80"
          />

          {/* Tagline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] bg-gradient-to-r from-white via-white to-[hsl(270,60%,75%)] bg-clip-text text-transparent">
            The Operating System for Deal Management
          </h1>

          {/* CTA */}
          <Button
            size="lg"
            className="rounded-full px-10 py-6 text-base font-semibold text-white bg-[hsl(270,65%,50%)] hover:bg-[hsl(270,65%,45%)] border-0"
            asChild
          >
            <Link to="/waitlist">Request Access</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
