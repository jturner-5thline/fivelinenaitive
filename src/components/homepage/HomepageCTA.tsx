import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export const HomepageCTA = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-16 md:py-24 bg-[#0a0a12]">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {/* Glows */}
          <div className="absolute -top-32 -left-20 w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,_hsl(270,70%,50%,0.35),_transparent_65%)] pointer-events-none" />
          <div className="absolute -bottom-32 -right-16 w-[460px] h-[460px] rounded-full bg-[radial-gradient(circle,_hsl(200,70%,55%,0.25),_transparent_65%)] pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(280,70%,65%,0.6)] to-transparent" />

          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0,0%,100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,100%) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage:
                "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />

          <div className="relative px-6 sm:px-12 lg:px-20 py-16 md:py-24 text-center max-w-3xl mx-auto">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-[hsl(270,65%,75%)] mb-5">
              Get started
            </p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-5">
              Ready to experience{" "}
              <span className="whitespace-nowrap">
                n<span className="bg-gradient-to-r from-[hsl(270,65%,55%)] to-[hsl(220,70%,72%)] bg-clip-text text-transparent">ai</span>tive?
              </span>
            </h2>
            <p className="text-lg text-white/65 mb-10 max-w-xl mx-auto">
              Join the deal teams operating with clarity, speed, and discipline. Request access today.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="marketing-glass-cta rounded-full px-9 py-6 text-base font-semibold border-0"
                asChild
              >
                <Link to="/waitlist">
                  Join Waitlist
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="rounded-full px-7 py-6 text-base font-medium text-white/80 hover:text-white hover:bg-white/10 border border-white/10"
                asChild
              >
                <Link to="/waitlist">Talk to the team</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
