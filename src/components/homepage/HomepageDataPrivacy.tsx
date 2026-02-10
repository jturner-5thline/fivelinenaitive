import { Database, Mail, BarChart3, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const dataUsageItems = [
  {
    icon: Database,
    title: "Deal & Lender Data",
    description: "We store your deal pipeline and lender relationships to power AI-driven insights, matching, and workflow automation.",
  },
  {
    icon: Mail,
    title: "Email Integration",
    description: "With your permission, we connect to Gmail to link relevant communications to deals — helping you stay organized without manual data entry.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Usage",
    description: "We collect anonymized usage data to improve platform performance and deliver personalized recommendations.",
  },
  {
    icon: Shield,
    title: "Your Data, Your Control",
    description: "You can export or delete your data at any time. We never sell your information to third parties.",
  },
];

export const HomepageDataPrivacy = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-12 md:py-16 bg-[#0a0a12] border-t border-white/5">
      {/* SVG gradient definition for icons */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(200, 90%, 70%)" />
            <stop offset="50%" stopColor="hsl(240, 70%, 65%)" />
            <stop offset="100%" stopColor="hsl(280, 60%, 55%)" />
          </linearGradient>
        </defs>
      </svg>
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 text-sm">
              <Shield className="w-4 h-4" />
              Data & Privacy
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center text-white mb-8 leading-tight">
            How We Use Your Data
          </h2>


          {/* Data usage grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {dataUsageItems.map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-2xl bg-white/5 border border-[hsl(263,45%,45%,0.7)] shadow-[0_0_20px_hsl(263,60%,50%,0.12)]"
              >
                <div className="w-10 h-10 rounded-lg bg-[hsl(220,80%,55%,0.1)] flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5" style={{ stroke: 'url(#icon-gradient)' }} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          {/* Privacy policy link */}
          <div className="text-center">
            <Link
              to="/privacy"
              className="inline-flex items-center gap-2 text-[hsl(292,46%,72%)] hover:text-[hsl(292,46%,82%)] transition-colors font-medium"
            >
              Read our Privacy Policy →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
