import { Quote } from "lucide-react";

const testimonials = [
  {
    quote: "nAItive has transformed how our team manages deal flow. The AI-powered insights help us identify opportunities faster than ever before.",
    author: "Managing Director",
    company: "Leading Transaction Advisory Firm",
  },
  {
    quote: "The platform's ability to integrate all our deal data in one place has dramatically improved our team's productivity and collaboration.",
    author: "Senior Vice President",
    company: "Private Credit Fund",
  },
  {
    quote: "Finally, a tool built by people who understand the nuances of lower-middle-market transactions. The workflow automation alone has saved us countless hours.",
    author: "Partner",
    company: "Growth Equity Fund",
  },
];

export const HomepageTestimonials = () => {
  return (
    <section className="py-24 md:py-32 bg-[#0a0a12]">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            What Customers Say{" "}
            <span className="bg-gradient-to-r from-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
              About nAItive
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
              <p className="text-white/80 leading-relaxed mb-6">
                "{testimonial.quote}"
              </p>
              <div>
                <p className="font-medium text-white">{testimonial.author}</p>
                <p className="text-sm text-white/50">{testimonial.company}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
