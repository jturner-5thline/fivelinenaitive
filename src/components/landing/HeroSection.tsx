import { Button } from "@/components/ui/button";
import { ArrowRight, Play, TrendingUp, Shield, Zap } from "lucide-react";

export const HeroSection = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/30" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-8 animate-fade-in">
            <Shield className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-muted-foreground">
              Trusted by 500+ Private Equity Firms
            </span>
          </div>

          {/* Main headline */}
          <h1 className="text-display md:text-5xl lg:text-6xl bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] mb-6 animate-fade-in tracking-tight leading-[1.1]">
            Deal Analysis Built for Growth-Stage Investors
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in leading-relaxed">
            Streamline your due diligence with AI-powered insights, automated financial modeling, 
            and real-time collaboration for lower-middle-market transactions.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in">
            <Button variant="hero" size="xl" asChild>
              <a href="/login">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </a>
            </Button>
            <Button variant="hero-outline" size="xl" asChild>
              <a href="mailto:demo@5thline.com?subject=Demo Request">
                <Play className="w-5 h-5" />
                Request Demo
              </a>
            </Button>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto animate-fade-in">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-success" />
                <span className="text-3xl font-semibold text-foreground">3.2x</span>
              </div>
              <span className="text-sm text-muted-foreground">Faster Deal Analysis</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-warning" />
                <span className="text-3xl font-semibold text-foreground">$2.4B</span>
              </div>
              <span className="text-sm text-muted-foreground">Deals Analyzed</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-accent" />
                <span className="text-3xl font-semibold text-foreground">98%</span>
              </div>
              <span className="text-sm text-muted-foreground">Client Satisfaction</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
