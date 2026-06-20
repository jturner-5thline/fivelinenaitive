import { useScrollReveal } from "@/hooks/useScrollReveal";

const steps = [
  {
    num: "01",
    title: "Centralize the deal",
    description: "Bring documents, emails, lenders, and milestones under one record. No more hunting across tools.",
  },
  {
    num: "02",
    title: "Activate execution",
    description: "Workflows kick off automatically — diligence checklists, lender outreach, internal approvals.",
  },
  {
    num: "03",
    title: "Track in real time",
    description: "Live status across every workstream and stakeholder, with AI flagging risk and stalled threads.",
  },
  {
    num: "04",
    title: "Close with confidence",
    description: "Audit-ready history, structured data, and clean handoffs from origination through funding.",
  },
];

const lenders = [
  { name: "First Republic Capital", status: "Term Sheet", tone: "purple" },
  { name: "Sequoia Credit Partners", status: "In Diligence", tone: "cyan" },
  { name: "Meridian Senior Debt", status: "Awaiting", tone: "amber" },
];

const toneStyles: Record<string, string> = {
  purple: "bg-[hsl(270,70%,55%,0.15)] text-[hsl(270,80%,80%)] border-[hsl(270,70%,55%,0.4)]",
  cyan: "bg-[hsl(180,70%,45%,0.15)] text-[hsl(180,80%,75%)] border-[hsl(180,70%,45%,0.4)]",
  amber: "bg-[hsl(38,90%,55%,0.15)] text-[hsl(38,95%,75%)] border-[hsl(38,90%,55%,0.4)]",
};

export const HomepageWorkflow = () => {
  const { ref: leftRef, isVisible: leftVisible } = useScrollReveal();
  const { ref: rightRef, isVisible: rightVisible } = useScrollReveal(0.1);

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Steps */}
          <div
            ref={leftRef}
            className={`transition-all duration-700 ${leftVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55 mb-5">
              <span className="inline-block w-6 h-px align-middle bg-white/30 mr-3" />
              How it works
            </p>
            <h2 className="text-3xl md:text-[44px] font-semibold tracking-[-0.02em] text-white leading-[1.08] mb-12 max-w-[28rem]">
              From mandate to close, in one system.
            </h2>

            <ol className="space-y-8">
              {steps.map((step, idx) => (
                <li
                  key={step.num}
                  style={{ transitionDelay: leftVisible ? `${idx * 90 + 120}ms` : "0ms" }}
                  className={`flex gap-5 transition-all duration-700 ease-out ${
                    leftVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                >
                  <div className="shrink-0">
                    <span className="font-mono text-2xl md:text-3xl font-semibold bg-gradient-to-b from-[hsl(270,70%,75%)] to-[hsl(270,40%,40%)] bg-clip-text text-transparent">
                      {step.num}
                    </span>
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg md:text-xl font-semibold text-white mb-1.5">
                      {step.title}
                    </h3>
                    <p className="text-white/60 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Deal card stack */}
          <div
            ref={rightRef}
            className={`relative transition-all duration-700 delay-150 ${rightVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            {/* back card */}
            <div className="absolute inset-x-8 top-8 h-full rounded-2xl bg-gradient-to-b from-[hsl(268,40%,14%,0.35)] to-[hsl(262,38%,8%,0.4)] border border-[hsl(270,35%,55%,0.12)] backdrop-blur-xl rotate-[2deg]" />
            <div className="absolute inset-x-4 top-4 h-full rounded-2xl bg-gradient-to-b from-[hsl(268,40%,15%,0.45)] to-[hsl(262,38%,9%,0.5)] border border-[hsl(270,35%,55%,0.16)] backdrop-blur-xl rotate-[1deg]" />

            {/* front card */}
            <div
              className="relative rounded-2xl p-7 border border-[hsl(220,15%,22%,0.9)] shadow-[inset_0_1px_0_hsl(220,15%,40%,0.12),0_1px_0_hsl(220,15%,8%,0.6),0_8px_24px_-12px_hsl(220,30%,2%,0.6)] backdrop-blur-2xl"
              style={{
                background:
                  'linear-gradient(135deg, #0a0a1a 0%, #0d1b3e 20%, #0a1628 40%, #061020 60%, #1a0a2e 80%, #0a0014 100%)',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase tracking-wider text-white/50">Active deal</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-1">TechFlow Solutions</h3>
              <p className="text-sm text-white/50 mb-6">$42M • Senior Term Loan • Q1 close</p>

              {/* progress */}
              <div className="mb-7">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/60">Execution progress</span>
                  <span className="text-xs font-mono text-[hsl(270,70%,80%)]">68%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[hsl(270,70%,60%)] via-[hsl(220,70%,60%)] to-[hsl(180,70%,55%)]"
                    style={{ width: "68%" }}
                  />
                </div>
              </div>

              {/* lender rows */}
              <div className="space-y-2.5">
                {lenders.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-[hsl(268,40%,14%,0.4)] border border-[hsl(270,30%,50%,0.14)]"
                  >
                    <span className="text-sm text-white/80">{l.name}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${toneStyles[l.tone]}`}>
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
