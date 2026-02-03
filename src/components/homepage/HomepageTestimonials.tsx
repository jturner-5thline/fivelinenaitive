import { Quote } from "lucide-react";

const testimonials = [
  {
    quote: "Teams managing complex, multi-party deal processes — from origination through diligence and close — who need execution to stay organized, transparent, and repeatable as deal volume scales.",
    author: "Advisors & Brokers",
  },
  {
    quote: "The platform's ability to integrate all our deal data in one place has dramatically improved our team's productivity and collaboration.",
    author: "Deal Teams & Committees",
  },
  {
    quote: "Finally, a tool built by people who understand the nuances of lower-middle-market transactions. The workflow automation alone has saved us countless hours.",
    author: "Corporate & Strategic Deal Teams",
  },
];

export const HomepageTestimonials = () => {
  return (
    <section className="py-24 md:py-32 bg-[#0a0a12]">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Who naitive is{" "}
            <span className="bg-gradient-to-r from-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
              Built For
            </span>
          </h2>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="relative p-8 rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 hover:border-white/20 transition-colors"
            >
              <Quote className="absolute top-6 right-6 w-8 h-8 text-white/10" />
              <div className="mb-4">
                <p className="font-medium text-white">{testimonial.author}</p>
              </div>
              <p className="text-white/80 leading-relaxed">
                "{testimonial.quote}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
