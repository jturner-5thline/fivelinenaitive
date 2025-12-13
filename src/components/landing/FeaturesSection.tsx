import { 
  BarChart3, 
  FileText, 
  Users, 
  Shield, 
  Zap, 
  LineChart,
  Database,
  Lock
} from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Financial Modeling",
    description: "Automated LBO, DCF, and comparable analysis with dynamic scenario modeling.",
  },
  {
    icon: FileText,
    title: "Document Analysis",
    description: "AI-powered extraction of key terms from CIMs, financials, and legal docs.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Real-time deal rooms with role-based access and audit trails.",
  },
  {
    icon: LineChart,
    title: "Market Intelligence",
    description: "Proprietary comp data and market multiples for accurate valuations.",
  },
  {
    icon: Database,
    title: "Deal Pipeline CRM",
    description: "Track opportunities from sourcing to close with custom workflows.",
  },
  {
    icon: Lock,
    title: "Bank-Grade Security",
    description: "SOC 2 Type II certified with end-to-end encryption.",
  },
];

export const FeaturesSection = () => {
  return (
    <section id="features" className="py-20 md:py-32 bg-secondary/30">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            Features
          </div>
          <h2 className="text-heading md:text-4xl text-foreground mb-4">
            Everything You Need to Close Deals Faster
          </h2>
          <p className="text-muted-foreground text-lg">
            Purpose-built tools for growth equity and lower-middle-market dealmakers.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:border-accent/30 transition-all duration-300"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-subheading text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
