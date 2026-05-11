import { LayoutDashboard, Mail, Network, FileSearch, Users } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const features = [
  {
    icon: LayoutDashboard,
    title: "Intelligent Pipeline Dashboard",
    description:
      "Every deal, every stage, every stakeholder — unified into a single source of truth. Spot bottlenecks before they cost you the deal.",
    wide: true,
  },
  {
    icon: Mail,
    title: "Automated Deal Digest",
    description:
      "Daily and weekly summaries of new activity, blockers, and next steps — delivered straight to your inbox.",
  },
  {
    icon: Network,
    title: "Lender Network",
    description:
      "Track outreach, engagement, and term sheets across your lender universe. No more spreadsheets, no more side channels.",
  },
  {
    icon: FileSearch,
    title: "Document Intelligence",
    description:
      "AI-parsed financials, CIMs, and diligence packages — surfaced as structured data inside the deal.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Roles, ownership, and approvals built around how deal teams actually work — not generic project management.",
  },
];

export const HomepageFeatureGrid = () => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div className="container mx-auto px-6">
        <div ref={ref} className={`max-w-3xl mb-14 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[hsl(270,65%,72%)] mb-4">
            Platform
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Built for the way deals actually move.
          </h2>
          <p className="mt-5 text-lg text-white/60 leading-relaxed max-w-2xl">
            Five purpose-built modules that replace the patchwork of spreadsheets, inboxes, and folders deal teams rely on today.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, idx) => (
            <article
              key={f.title}
              className={`group relative overflow-hidden rounded-2xl p-7 bg-gradient-to-br from-[hsl(190,85%,60%,0.18)] via-[hsl(230,75%,65%,0.14)] to-[hsl(270,70%,55%,0.22)] border border-[hsl(220,60%,70%,0.22)] backdrop-blur-2xl shadow-[inset_0_1px_0_hsl(190,80%,80%,0.08),0_8px_24px_-12px_hsl(265,60%,4%,0.6)] hover:border-[hsl(220,70%,75%,0.38)] hover:-translate-y-0.5 transition-all duration-300 ${
                f.wide ? "lg:col-span-2 lg:row-span-1" : ""
              }`}
            >
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[hsl(270,60%,40%,0.45)] to-[hsl(220,60%,35%,0.35)] border border-[hsl(280,70%,65%,0.4)] flex items-center justify-center mb-5">
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2.5">{f.title}</h3>
                <p className={`text-white/60 leading-relaxed ${f.wide ? "text-base max-w-xl" : "text-sm"}`}>
                  {f.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
