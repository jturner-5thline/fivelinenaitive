import { Shield, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const securityFeatures = [
  "End-to-end encryption",
  "SOC 2 Type II certified",
  "Role-based access controls",
  "Comprehensive audit trails",
];

const badges = ["SOC2", "GDPR", "CCPA"];

export const HomepageSecurity = () => {
  return (
    <section className="py-24 md:py-32 bg-[#0a0a12]">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(292,46%,72%)]/10 border border-[hsl(292,46%,72%)]/20 text-[hsl(292,46%,72%)] text-sm">
              <Shield className="w-4 h-4" />
              Security
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center text-white mb-6 leading-tight">
            Built for Enterprise{" "}
            <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
              Secure by Design
            </span>
          </h2>

          <p className="text-center text-white/60 text-lg mb-12 max-w-2xl mx-auto">
            Modern & secure data practices to keep your deal information protected.
          </p>

          {/* Security features */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {securityFeatures.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 text-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-[hsl(292,46%,72%)]" />
                {feature}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex justify-center mb-16">
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              asChild
            >
              <Link to="/login">
                <Lock className="w-4 h-4 mr-2" />
                Learn more about security
              </Link>
            </Button>
          </div>

          {/* Compliance badges */}
          <div className="flex justify-center gap-6">
            {badges.map((badge) => (
              <div
                key={badge}
                className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-white font-semibold text-sm"
              >
                {badge}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
