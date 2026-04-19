import { useScrollReveal } from "@/hooks/useScrollReveal";

const stats = [
  { value: "$4.2B+", label: "Deal volume tracked" },
  { value: "120+", label: "Active lender relationships" },
  { value: "3×", label: "Faster lender outreach" },
  { value: "SOC 2", label: "Compliance ready" },
];

export const HomepageStatsBar = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-10 md:py-14 bg-[#0a0a12]">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <div className="relative rounded-2xl overflow-hidden bg-white/[0.045] border border-white/10 backdrop-blur-2xl">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10">
            {stats.map((s) => (
              <div key={s.label} className="px-6 py-8 text-center">
                <p className="text-3xl md:text-4xl font-semibold bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                  {s.value}
                </p>
                <p className="mt-2 text-xs md:text-sm uppercase tracking-wider text-white/50">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
