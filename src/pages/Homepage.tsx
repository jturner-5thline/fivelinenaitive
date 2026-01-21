import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { 
  Sparkles, 
  Briefcase, 
  Users, 
  Workflow, 
  BarChart3, 
  Shield,
  ArrowRight,
  CheckCircle2,
  Building2,
  TrendingUp
} from "lucide-react";

const capabilities = [
  {
    icon: Workflow,
    title: "AI-Powered Workflow Automation",
    description: "Configure complex workflows using natural language. Our AI interprets your requirements and builds automated processes that adapt to your deal pipeline.",
    highlights: ["Natural language configuration", "Smart trigger detection", "Automated notifications"]
  },
  {
    icon: Briefcase,
    title: "Deal-Focused Management",
    description: "Purpose-built interface for tracking deals from sourcing to close. Manage lenders, milestones, and documentation in one unified workspace.",
    highlights: ["Lender tracking & Kanban", "Milestone management", "Document data rooms"]
  },
  {
    icon: Users,
    title: "Built for Transaction Professionals",
    description: "Designed specifically for transaction-advisory professionals and lenders who need institutional-grade tools without the complexity.",
    highlights: ["Role-based access", "Team collaboration", "Client-ready reporting"]
  }
];

const features = [
  { icon: Sparkles, label: "AI Research Assistant" },
  { icon: BarChart3, label: "Analytics & Insights" },
  { icon: Shield, label: "Bank-Grade Security" },
  { icon: Building2, label: "Multi-Company Support" },
  { icon: TrendingUp, label: "Performance Metrics" },
  { icon: Workflow, label: "Custom Workflows" }
];

export default function Homepage() {
  return (
    <>
      <Helmet>
        <title>nAItive | Intelligence, by Design</title>
        <meta 
          name="description" 
          content="AI-powered deal management platform for transaction-advisory professionals and lenders. Streamline workflows, manage deals, and close faster." 
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          
          <div className="container mx-auto px-6 relative">
          <div className="max-w-4xl mx-auto text-center">
              {/* nAItive Brand */}
              <h2 className="text-5xl md:text-6xl font-bold tracking-tighter mb-6">
                <span className="text-muted-foreground/30">n</span>
                <span 
                  className="bg-clip-text text-transparent"
                  style={{ 
                    backgroundImage: 'linear-gradient(45deg, hsl(var(--muted-foreground)/0.5) 0%, hsl(var(--accent)) 50%, hsl(var(--muted-foreground)/0.5) 100%)',
                    backgroundSize: '300% 300%',
                    animation: 'shimmer 8s ease-in-out infinite',
                  }}
                >AI</span>
                <span className="text-muted-foreground/30">tive</span>
              </h2>
              <style>{`
                @keyframes shimmer {
                  0%, 100% { background-position: 100% 100%; }
                  50% { background-position: 0% 0%; }
                }
              `}</style>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-8">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-muted-foreground">
                  Intelligence, by Design
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] tracking-tight leading-[1.1]">
                The Deal Management Platform for Modern Advisors
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
                nAItive combines AI-powered automation with intuitive deal tracking, 
                purpose-built for transaction-advisory professionals and lending teams.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                <Button size="lg" asChild className="px-8">
                  <Link to="/login">
                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild className="px-8">
                  <a href="mailto:demo@5thline.com?subject=Demo Request">
                    Request Demo
                  </a>
                </Button>
              </div>

              {/* Quick feature badges */}
              <div className="flex flex-wrap justify-center gap-3">
                {features.map((feature) => (
                  <div 
                    key={feature.label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border text-sm text-muted-foreground"
                  >
                    <feature.icon className="w-4 h-4 text-accent" />
                    {feature.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities Section */}
        <section className="py-16 md:py-24 bg-secondary/30">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                Platform Capabilities
              </h2>
              <p className="text-muted-foreground text-lg">
                Everything you need to manage deals efficiently and close faster.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {capabilities.map((capability) => (
                <Card key={capability.title} className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-8">
                    <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
                      <capability.icon className="w-7 h-7 text-accent" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-foreground">
                      {capability.title}
                    </h3>
                    <p className="text-muted-foreground mb-6 leading-relaxed">
                      {capability.description}
                    </p>
                    <ul className="space-y-2">
                      {capability.highlights.map((highlight) => (
                        <li key={highlight} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Target Audience Section */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  Built for Deal Professionals
                </h2>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Whether you're advising on transactions or sourcing capital, nAItive adapts to your workflow.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-card/50">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Briefcase className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">Transaction Advisors</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Manage multiple client engagements, track lender outreach, and maintain organized data rooms—all in one platform.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">Lending Professionals</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Track deal flow, manage borrower relationships, and streamline your origination process with AI-powered insights.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 bg-secondary/30">
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                Ready to Transform Your Deal Flow?
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Join transaction professionals who are closing deals faster with nAItive.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button size="lg" asChild className="px-8">
                  <Link to="/login">
                    Start Free Trial
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button variant="ghost" size="lg" asChild>
                  <Link to="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-border">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} nAItive. All rights reserved.</p>
              <div className="flex items-center gap-6">
                <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
