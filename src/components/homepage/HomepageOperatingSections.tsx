import { Building2, FileSearch, Handshake, Layers3, LineChart, Mail, Network, Quote, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookDemoDialog } from "./BookDemoDialog";

const capabilities = [
  { title: "Intelligent Pipeline Dashboard", description: "Every deal, every stage, every stakeholder — unified into a single source of truth. Spot bottlenecks before they cost you the deal.", icon: Layers3 },
  { title: "Automated Deal Digest", description: "Daily and weekly summaries of new activity, blockers, and next steps — delivered straight to your inbox.", icon: Mail },
  { title: "Lender Network", description: "Track outreach, engagement, and term sheets across your lender universe. No more spreadsheets, no more side channels.", icon: Network },
  { title: "Document Intelligence", description: "AI-parsed financials, CIMs, and diligence packages — surfaced as structured data inside the deal.", icon: FileSearch },
  { title: "Team Collaboration", description: "Roles, ownership, and approvals built around how deal teams actually work — not generic project management.", icon: Users },
];
const audiences = [
  { title: "Advisors & Brokers", icon: Handshake, description: "Teams managing complex, multi-party deal processes — from origination through diligence and close — who need execution to stay organized, transparent, and repeatable as deal volume scales" },
  { title: "Credit & Investment Teams", icon: LineChart, description: "Firms evaluating, structuring, and advancing deals across multiple stakeholders — where visibility, coordination, and execution discipline are critical to moving capital efficiently." },
  { title: "Corporate Deal Teams", icon: Building2, description: "Internal teams responsible for acquisitions, financings, and strategic transactions — coordinating diligence, documentation, and approvals across legal, finance, and external partners." },
];
const steps = [
  { title: "Your entire deal, connected.", description: "Bring deals, contacts, documents, communications, and next steps into one workspace—so your team can see where things stand without digging through inboxes and spreadsheets." },
  { title: "Less admin. More deal time.", description: "Use deal-aware AI and connected workflows to find information, summarize activity, and draft updates—reducing the time your team spends assembling context and keeping everyone informed." },
  { title: "Built-in funding intelligence.", description: "Keep lender profiles, preferences, relationship history, and deal activity connected—so your team can evaluate fit and coordinate outreach without relying on static lists or offline notes." },
];

function PipelineVisual() {
  return <div className="os-pipeline-visual" aria-hidden="true">
    <div className="flex items-center justify-between border-b border-border pb-3 mb-3"><span className="text-xs text-foreground">Active Pipeline</span><span className="font-mono text-[10px] text-primary">LIVE</span></div>
    <div className="grid grid-cols-3 gap-3">
      {["Origination", "In Diligence", "Closing"].map((stage, i) => <div key={stage} className="min-w-0"><div className="text-[10px] text-muted-foreground mb-3 flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary shrink-0" />{stage}</div>
        {Array.from({ length: i === 1 ? 2 : 1 }, (_, n) => <div key={n} className="os-pipeline-item mb-2 p-3 rounded-md border border-border"><div className="h-1 w-3/4 bg-foreground/30 rounded-sm mb-2" /><div className="h-1 w-1/2 bg-muted-foreground/20 rounded-sm mb-4" /><div className="flex justify-between items-center"><div className="h-1 w-8 bg-primary/50" /><span className="h-3 w-3 rounded-full bg-muted-foreground/20" /></div></div>)}
      </div>)}
    </div>
  </div>;
}

export function HomepageOperatingSections() {
  return <>
    <section id="platform" className="os-section os-container">
      <p className="os-eyebrow mb-4">PLATFORM</p>
      <h2 className="os-section-title mb-4">Built for the way deals actually move.</h2>
      <p className="max-w-3xl leading-relaxed text-base mb-8">naitive is designed for teams responsible for running complex deals end-to-end — coordinating stakeholders, managing review and diligence, and moving work forward across fragmented systems.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {capabilities.map(({ title, description, icon: Icon }, index) => <article key={title} className={`os-capability rounded-lg border border-border bg-card p-6 ${index === 0 ? "md:col-span-2" : ""}`}>
          <Icon className="h-6 w-6 text-primary mb-5" strokeWidth={1.5} />
          <h3 className="text-lg mb-3">{title}</h3>
          <p className="text-sm leading-relaxed max-w-xl">{description}</p>
          {index === 0 && <PipelineVisual />}
        </article>)}
      </div>
    </section>
    <section id="built-for" className="os-section os-container">
      <h2 className="os-section-title mb-8">Built for:</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0">
        {audiences.map(({ title, description, icon: Icon }, i) => <div key={title} className={`min-w-0 ${i > 0 ? "md:border-l md:border-border md:pl-8" : ""} ${i < 2 ? "md:pr-8" : ""}`}>
          <Icon className="h-7 w-7 text-primary mb-5" strokeWidth={1.4} />
          <h3 className="text-xl mb-4">{title}</h3><p className="text-sm leading-7">{description}</p>
        </div>)}
      </div>
    </section>
    <section className="os-testimonial-band border-y border-border">
      <div className="os-container os-section grid grid-cols-1 md:grid-cols-[1fr_0.45fr] items-center gap-8">
        <div><Quote className="h-8 w-8 text-primary mb-5" strokeWidth={1.3} /><blockquote className="text-2xl md:text-[28px] leading-[1.5] text-foreground">“naitive gave our team one place to run every deal — from first lender conversations through closing. We spend far less time chasing updates and far more time moving transactions forward.”</blockquote>
          <div className="mt-6"><p className="os-attribution text-base font-semibold">Greg Blount</p><p className="mt-1 text-sm">Founder, Blount Capital</p></div>
        </div>
        <div className="os-portrait-placeholder" aria-label="Blount Capital"><span className="font-mono text-primary text-sm">BLOUNT CAPITAL</span><span className="os-monogram">B</span></div>
      </div>
    </section>
    <section className="os-section os-container">
      <h2 className="os-section-title mb-10">From mandate to close, in one system</h2>
      <div className="os-lifecycle grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
        {steps.map((step, i) => <div className="relative min-w-0" key={step.title}><div className="os-step-number relative z-10 h-10 w-10 border border-primary/40 rounded-full bg-background flex items-center justify-center text-primary font-mono text-sm mb-6">0{i + 1}</div><h3 className="text-lg mb-3">{step.title}</h3><p className="text-sm leading-7">{step.description}</p></div>)}
      </div>
    </section>
    <section className="os-section border-t border-border text-center">
      <div className="os-container"><h2 className="os-section-title mb-4">Streamline Your Deal Execution</h2><p className="text-base mb-7">See how our system unifies execution across your deals.</p><BookDemoDialog><Button className="os-primary h-11 px-6">Book a Demo<ArrowRight /></Button></BookDemoDialog></div>
    </section>
  </>;
}