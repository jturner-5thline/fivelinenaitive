import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export const HomepageCTA = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="relative overflow-hidden rounded-3xl border border-[hsl(270,35%,55%,0.2)] bg-gradient-to-b from-[hsl(268,40%,16%,0.5)] to-[hsl(262,38%,9%,0.55)] backdrop-blur-2xl shadow-[inset_0_1px_0_hsl(270,40%,70%,0.06),0_20px_50px_-20px_hsl(265,60%,3%,0.7)]">
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
              Ready to experience naitive?
            </h2>
            <p className="text-lg text-white/65 mb-10 max-w-xl mx-auto">
              Join the deal teams operating with clarity, speed, and discipline. Request access today.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="marketing-glass-cta px-9 py-6 text-base font-semibold border-0"
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
                className="px-7 py-6 text-base font-medium text-white/80 hover:text-white hover:bg-white/10 border border-white/10"
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
