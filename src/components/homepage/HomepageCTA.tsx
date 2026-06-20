import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export const HomepageCTA = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div
          className="relative overflow-hidden rounded-3xl border border-[hsl(270,35%,55%,0.2)] backdrop-blur-2xl shadow-[inset_0_1px_0_hsl(270,40%,70%,0.06),0_20px_50px_-20px_hsl(265,60%,3%,0.7)]"
          style={{
            background:
              "linear-gradient(135deg, #0a0a1a 0%, #0d1b3e 20%, #0a1628 40%, #061020 60%, #1a0a2e 80%, #0a0014 100%)",
          }}
        >
          <div className="relative px-6 sm:px-12 lg:px-20 py-16 md:py-24 text-center max-w-3xl mx-auto">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55 mb-5 inline-flex items-center justify-center gap-3">
              <span className="inline-block w-6 h-px align-middle bg-white/30" />
              Get started
              <span className="inline-block w-6 h-px align-middle bg-white/30" />
            </p>
            <h2 className="text-4xl md:text-5xl lg:text-[56px] font-semibold tracking-[-0.02em] text-white leading-[1.05] mb-6">
              Ready to experience naitive?
            </h2>
            <p className="text-base md:text-lg font-light text-white/65 leading-[1.6] mb-10 max-w-[32rem] mx-auto">
              Join the deal teams operating with clarity, speed, and discipline. Request access today.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="marketing-glass-cta px-9 py-6 text-base font-semibold border-0"
                asChild
              >
                <Link to="/auth">
                  Sign Up
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
