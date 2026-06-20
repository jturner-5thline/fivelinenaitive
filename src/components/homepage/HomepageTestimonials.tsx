import { useScrollReveal } from "@/hooks/useScrollReveal";

const testimonials = [
  {
    quote:
      "Teams managing complex, multi-party deal processes — from origination through diligence and close — who need execution to stay organized, transparent, and repeatable as deal volume scales.",
    author: "Advisors & Brokers",
    accent: "purple",
  },
  {
    quote:
      "Firms evaluating, structuring, and advancing deals across multiple stakeholders — where visibility, coordination, and execution discipline are critical to moving capital efficiently.",
    author: "Credit & Investment Teams",
    accent: "cyan",
  },
  {
    quote:
      "Internal teams responsible for acquisitions, financings, and strategic transactions — coordinating diligence, documentation, and approvals across legal, finance, and external partners.",
    author: "Corporate Deal Teams",
    accent: "blue",
  },
];

const accentBar: Record<string, string> = {
  purple: "bg-gradient-to-b from-[hsl(270,70%,65%)] to-[hsl(270,70%,40%)]",
  cyan: "bg-gradient-to-b from-[hsl(180,70%,55%)] to-[hsl(200,70%,40%)]",
  blue: "bg-gradient-to-b from-[hsl(220,80%,65%)] to-[hsl(240,70%,45%)]",
};

export const HomepageTestimonials = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="max-w-2xl mb-14 md:mb-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55 mb-5">
            <span className="inline-block w-6 h-px align-middle bg-white/30 mr-3" />
            Built for
          </p>
          <h2 className="text-3xl md:text-[44px] font-semibold tracking-[-0.02em] text-white leading-[1.08]">
            Who naitive is built for.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.author}
              className="group relative overflow-hidden rounded-2xl p-7 bg-gradient-to-b from-[hsl(268,40%,16%,0.45)] to-[hsl(262,38%,9%,0.5)] border border-[hsl(270,35%,55%,0.18)] backdrop-blur-2xl shadow-[inset_0_1px_0_hsl(270,40%,70%,0.05),0_8px_24px_-12px_hsl(265,60%,4%,0.6)] hover:border-[hsl(270,40%,60%,0.3)] transition-all duration-300"
            >
              {/* Accent bar */}
              <div className={`absolute left-0 top-7 bottom-7 w-0.5 rounded-full ${accentBar[t.accent]}`} />

              <div className="pl-3">
                <p className="text-2xl font-semibold text-white mb-4">{t.author}</p>
                <p className="text-white/65 leading-relaxed text-[15px]">
                  {t.quote}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
