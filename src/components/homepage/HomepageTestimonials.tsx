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
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[hsl(270,65%,72%)] mb-4">
            Built for
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Who naitive is built for.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.author}
              className="group relative overflow-hidden rounded-2xl p-7 bg-white/[0.05] border border-white/10 backdrop-blur-2xl hover:bg-white/[0.075] hover:border-white/20 transition-all duration-300"
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
