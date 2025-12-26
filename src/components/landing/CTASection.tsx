import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

const benefits = [
  "14-day free trial",
  "No credit card required",
  "Cancel anytime",
  "Dedicated onboarding",
];

export const CTASection = () => {
  return (
    <section className="py-20 md:py-32">
      <div className="container mx-auto px-6">
        <div className="relative max-w-4xl mx-auto text-center">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 rounded-3xl -z-10" />
          
          <div className="py-12 px-6 md:py-20 md:px-12">
            <h2 className="text-heading md:text-4xl bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] mb-4">
              Ready to Transform Your Deal Process?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Join hundreds of investment professionals who trust nAItive to source, 
              analyze, and close better deals.
            </p>

            {/* Benefits */}
            <div className="flex flex-wrap justify-center gap-4 mb-10">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-success" />
                  {benefit}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button variant="hero" size="xl">
                Start Your Free Trial
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="xl">
                Schedule a Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
