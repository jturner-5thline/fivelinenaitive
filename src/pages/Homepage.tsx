import { Helmet } from "react-helmet-async";
import {
  HomepageHeader,
  HomepageHero,
  HomepageValueProp,
  HomepageFeatureSection,
  HomepageScrollingTags,
  HomepageTestimonials,
  HomepageSecurity,
  HomepageCTA,
  HomepageFooter,
  PlatformPreviewDealPipeline,
  PlatformPreviewLenderKanban,
  PlatformPreviewDataRoom,
} from "@/components/homepage";

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

      <div className="min-h-screen bg-[#0a0a12]">
        <HomepageHeader />
        
        <HomepageHero />
        
        <HomepageValueProp />
        
        <HomepageScrollingTags />
        
        {/* Feature Sections with Platform Previews */}
        <HomepageFeatureSection
          title="Powered by AI-Driven Deal Intelligence"
          description="AI agents designed for transaction professionals. Analyze opportunities, track pipeline metrics, and surface insights automatically — so you can focus on closing deals."
          image={<PlatformPreviewDealPipeline />}
        />
        
        <HomepageScrollingTags />
        
        <HomepageFeatureSection
          title="Accurate, Organized Lender Tracking"
          description="nAItive seamlessly integrates your lender relationships with deal flow, maintaining visibility, organization, and real-time status across your entire process."
          image={<PlatformPreviewLenderKanban />}
          reverse
        />
        
        <HomepageFeatureSection
          title="Leverage Your Firm's Workflows"
          description="Use tools designed to create work outputs exactly as you would — organized data rooms, milestone tracking, and automated document management."
          image={<PlatformPreviewDataRoom />}
        />
        
        <HomepageTestimonials />
        
        <HomepageSecurity />
        
        <HomepageCTA />
        
        <HomepageFooter />
      </div>
    </>
  );
}
