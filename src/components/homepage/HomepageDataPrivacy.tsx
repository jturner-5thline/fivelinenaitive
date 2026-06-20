import { Database, Mail, BarChart3, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const dataUsageItems = [
  {
    icon: Database,
    title: "Client & Deal Data",
    description:
      "We store your deal pipeline and lender relationships to power AI-driven insights, matching, and workflow automation.",
  },
  {
    icon: Mail,
    title: "Email Integration",
    description:
      "With your permission, we connect to Gmail to link relevant communications to deals — helping you stay organized without manual data entry.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Usage",
    description:
      "We collect anonymized usage data to improve platform performance and deliver personalized recommendations.",
  },
  {
    icon: Shield,
    title: "Your Data, Your Control",
    description:
      "You can export or delete your data at any time. We never sell your information to third parties.",
  },
];

export const HomepageDataPrivacy = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div ref={ref} className={`container mx-auto px-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-16 items-start">
          {/* Left intro */}
          <div className="lg:sticky lg:top-24">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55 mb-5">
              <span className="inline-block w-6 h-px align-middle bg-white/30 mr-3" />
              Data &amp; Privacy
            </p>
            <h2 className="text-3xl md:text-[44px] font-semibold tracking-[-0.02em] text-white leading-[1.08] mb-6">
              Your data,<br/>your control.
            </h2>
            <p className="text-base font-light text-white/60 leading-[1.6] mb-7 max-w-[26rem]">
              n<span className="bg-gradient-to-r from-[hsl(270,65%,55%)] to-[hsl(220,70%,72%)] bg-clip-text text-transparent">ai</span>tive does not sell or monetize customer data. Period.
            </p>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-2 text-sm font-medium text-[hsl(270,65%,78%)] hover:text-white transition-colors"
            >
              Read our Privacy Policy
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Right grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dataUsageItems.map((item) => (
              <div
                key={item.title}
                className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-b from-[hsl(268,40%,16%,0.45)] to-[hsl(262,38%,9%,0.5)] border border-[hsl(270,35%,55%,0.18)] backdrop-blur-2xl shadow-[inset_0_1px_0_hsl(270,40%,70%,0.05),0_8px_24px_-12px_hsl(265,60%,4%,0.6)] hover:border-[hsl(270,40%,60%,0.3)] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(270,60%,40%,0.4)] to-[hsl(220,60%,35%,0.3)] border border-[hsl(280,70%,65%,0.35)] flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
