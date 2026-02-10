import { useScrollReveal } from "@/hooks/useScrollReveal";

const testimonials = [
  {
    quote: "Teams managing complex, multi-party deal processes — from origination through diligence and close — who need execution to stay organized, transparent, and repeatable as deal volume scales.",
    author: "Advisors & Brokers",
  },
  {
    quote: "Firms evaluating, structuring, and advancing deals across multiple stakeholders — where visibility, coordination, and execution discipline are critical to moving capital efficiently.",
    author: "Credit & Investment Teams",
  },
  {
    quote: "Internal teams responsible for acquisitions, financings, and strategic transactions — coordinating diligence, documentation, and approvals across legal, finance, and external partners.",
    author: "Corporate Deal Teams",
  },
];

export const HomepageTestimonials = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-12 md:py-16 bg-[#0a0a12]">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Who n<span className="bg-gradient-to-b from-[hsl(292,46%,72%)] to-[hsl(280,60%,45%)] bg-clip-text text-transparent">ai</span>tive is built for
          </h2>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="relative p-8 rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 hover:border-white/20 transition-colors"
            >
              
              <div className="mb-4 text-center">
                <p className="text-2xl font-medium text-white">{testimonial.author}</p>
              </div>
              <p className="text-white/80 leading-relaxed text-center">
                {testimonial.quote}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
