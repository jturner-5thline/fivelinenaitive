import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { SpinningGlobe } from "@/components/SpinningGlobe";
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

export default function Promo() {
  return (
    <>
      <Helmet>
        <title>nAItive | Intelligence, by Design</title>
        <meta 
          name="description" 
          content="AI-powered deal management platform for transaction-advisory professionals and lenders. Streamline workflows, manage deals, and close faster." 
        />
      </Helmet>

      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
        <SpinningGlobe />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col">
          {/* Hero Section with nAItive branding like Auth page */}
          <div className="absolute top-[-5%] left-1/2 -translate-x-1/2 pointer-events-none select-none flex flex-col items-center">
            <h1 className="text-[18vw] font-sans font-bold tracking-tighter whitespace-nowrap animate-fade-in">
              <span className="text-white/[0.10]">n</span>
              <span 
                className="bg-clip-text text-transparent"
                style={{ 
                  backgroundImage: 'linear-gradient(45deg, rgba(100,116,139,0.3) 0%, rgba(139,92,246,0.45) 50%, rgba(148,163,184,0.3) 100%)',
                  backgroundSize: '300% 300%',
                  animation: 'shimmer 8s ease-in-out infinite',
                }}
              >AI</span>
              <span className="text-white/[0.10]">tive</span>
            </h1>
            <p 
              className="text-white text-[1.65vw] font-light tracking-[0.72em] -mt-[5.5vw] uppercase whitespace-nowrap ml-[0.35em] opacity-0"
              style={{
                animation: 'fadeInTagline 0.3s ease-out 0.4s forwards',
              }}
            >
              Intelligence, by Design
            </p>
          </div>
          <style>{`
            @keyframes shimmer {
              0%, 100% { background-position: 100% 100%; }
              50% { background-position: 0% 0%; }
            }
            @keyframes fadeInTagline {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>

          {/* Main Content - positioned at bottom like Auth page */}
          <div className="flex-1 flex flex-col justify-end pb-8 md:pb-12 px-4">
            <div className="container mx-auto max-w-5xl">
              {/* Hero Text */}
              <div className="text-center mb-12">
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 text-white/90 tracking-tight leading-tight">
                  The Deal Management Platform for Modern Advisors
                </h2>
                <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
                  nAItive combines AI-powered automation with intuitive deal tracking, 
                  purpose-built for transaction-advisory professionals and lending teams.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <Button 
                  size="lg" 
                  asChild 
                  className="px-8 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 border-0 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105"
                >
                  <Link to="/login">
                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  asChild 
                  className="px-8 bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40"
                >
                  <a href="mailto:demo@5thline.com?subject=Demo Request">
                    Request Demo
                  </a>
                </Button>
              </div>

              {/* Quick feature badges */}
              <div className="flex flex-wrap justify-center gap-3 mb-12">
                {features.map((feature) => (
                  <div 
                    key={feature.label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/60"
                  >
                    <feature.icon className="w-4 h-4 text-purple-400/80" />
                    {feature.label}
                  </div>
                ))}
              </div>

              {/* Capabilities Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {capabilities.map((capability) => (
                  <Card key={capability.title} className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardContent className="p-5">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
                        <capability.icon className="w-5 h-5 text-purple-400" />
                      </div>
                      <h3 className="text-base font-semibold mb-2 text-white/90">
                        {capability.title}
                      </h3>
                      <p className="text-sm text-white/50 mb-4 leading-relaxed">
                        {capability.description}
                      </p>
                      <ul className="space-y-1.5">
                        {capability.highlights.map((highlight) => (
                          <li key={highlight} className="flex items-center gap-2 text-xs text-white/40">
                            <CheckCircle2 className="w-3 h-3 text-purple-400/60 shrink-0" />
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-white/30">
                <p>© {new Date().getFullYear()} nAItive. All rights reserved.</p>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <Link to="/privacy" className="hover:text-white/50 transition-colors">Privacy Policy</Link>
                  <Link to="/terms" className="hover:text-white/50 transition-colors">Terms of Service</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
