import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { SpinningGlobe } from "@/components/SpinningGlobe";

export const HomepageHero = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    navigate(`/waitlist?email=${encodeURIComponent(trimmed)}`);
  };

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

          {/* Supporting body copy */}
          <div className="mt-4 sm:mt-6 max-w-[42rem] flex flex-col gap-3 sm:gap-4 text-sm sm:text-base md:text-lg font-light leading-relaxed text-white/70">
            <p>
              We centralize deal execution into a single operating system — bringing work, decisions, and data together as deals move through review, diligence, and approval.
            </p>
            <p>
              Intelligence is embedded directly into execution, surfacing bottlenecks, highlighting risk, and keeping work moving without adding more tools or manual oversight.
            </p>
          </div>

          {/* Email capture form */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 sm:mt-8 w-full max-w-[36rem] flex flex-col gap-3"
            aria-label="Book a demo"
          >
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
              <label htmlFor="hero-email" className="sr-only">
                Work email
              </label>
              <input
                id="hero-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your work email"
                className="flex-1 min-w-0 h-12 px-4 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/40 text-sm sm:text-base outline-none transition-colors focus:border-white/40 focus:bg-white/10"
              />
              <Button
                type="submit"
                size="lg"
                className="marketing-glass-cta h-12 px-6 sm:px-8 text-sm sm:text-base font-semibold border-0 shrink-0"
              >
                Book a demo
              </Button>
            </div>
            <p className="text-xs leading-relaxed font-light text-white/40 max-w-[36rem]">
              By submitting this form, you consent to allow naitive to store and process the personal information submitted here to provide you with occasional updates and content that may interest you.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
};
