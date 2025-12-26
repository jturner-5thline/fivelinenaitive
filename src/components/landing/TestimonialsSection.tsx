import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    quote: "nAItive cut our due diligence time in half. The automated financial modeling alone has been a game-changer for our team.",
    author: "Sarah Chen",
    role: "Managing Partner",
    company: "Elevate Capital Partners",
    avatar: "SC",
  },
  {
    quote: "Finally, a platform built by people who understand lower-middle-market deals. The valuation comps are incredibly accurate.",
    author: "Michael Torres",
    role: "Principal",
    company: "Meridian Growth Equity",
    avatar: "MT",
  },
  {
    quote: "The collaboration features keep our entire team aligned. We've closed 40% more deals since implementing nAItive.",
    author: "Jennifer Walsh",
    role: "VP of Investments",
    company: "Summit Point Capital",
    avatar: "JW",
  },
];

export const TestimonialsSection = () => {
  return (
    <section className="py-20 md:py-32 bg-primary">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-heading md:text-4xl text-primary-foreground mb-4 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
            Trusted by Leading Investors
          </h2>
          <p className="text-primary-foreground/70 text-lg">
            See why top private equity firms choose nAItive for their deal analysis.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-primary-foreground/5 backdrop-blur-sm border border-primary-foreground/10 rounded-xl p-6 hover:bg-primary-foreground/10 transition-colors"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                ))}
              </div>

              {/* Quote */}
              <div className="relative mb-6">
                <Quote className="absolute -top-2 -left-2 w-8 h-8 text-primary-foreground/10" />
                <p className="text-primary-foreground/90 leading-relaxed pl-4">
                  "{testimonial.quote}"
                </p>
              </div>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-sm font-semibold text-accent-foreground">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-medium text-primary-foreground">{testimonial.author}</p>
                  <p className="text-sm text-primary-foreground/60">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
