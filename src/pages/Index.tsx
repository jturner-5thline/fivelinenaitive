import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { DealDashboardPreview } from "@/components/landing/DealDashboardPreview";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";
import { Helmet } from "react-helmet-async";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>nAItive | Deal Analysis Platform for Growth Investors</title>
        <meta 
          name="description" 
          content="Streamline due diligence with AI-powered insights and automated financial modeling for growth-stage and lower-middle-market transactions." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <HeroSection />
          <FeaturesSection />
          <DealDashboardPreview />
          <TestimonialsSection />
          <CTASection />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
