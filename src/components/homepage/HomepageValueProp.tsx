import { useScrollReveal } from "@/hooks/useScrollReveal";

export const HomepageValueProp = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="relative py-12 md:py-16 bg-transparent border-0 shadow-none outline-none -mt-px">
      <div className="relative container mx-auto px-6" style={{ zIndex: 1 }}>
        <div
          ref={ref}
          className={`max-w-4xl mx-auto text-center space-y-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-xl md:text-2xl lg:text-3xl font-medium text-white leading-relaxed">
            We centralize deal execution into a single operating system — bringing work, decisions, and data together as deals move through review, diligence, and approval.
          </p>
          <p className="text-xl md:text-2xl lg:text-3xl font-medium text-white leading-relaxed">
            Intelligence is embedded directly into execution, surfacing bottlenecks, highlighting risk, and keeping work moving without adding more tools or manual oversight.
          </p>
          <p className="text-xl md:text-2xl lg:text-3xl font-medium text-white leading-relaxed">
            Your data remains yours. n<span className="bg-gradient-to-r from-[hsl(270,65%,55%)] to-[hsl(220,70%,72%)] bg-clip-text text-transparent">ai</span>tive does not sell or monetize customer data.
          </p>
        </div>
      </div>
    </section>
  );
};
