import { Helmet } from "react-helmet-async";
import {
  HomepageHeader,
  HomepageHero,
  HomepageValueProp,
  HomepageFeatureSection,
  HomepageScrollingTags,
  HomepageTestimonials,
  HomepageSecurity,
  HomepageDataPrivacy,
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
        <title>naitive | Intelligence, by Design</title>
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
          title="The Operating Layer for Transaction Management"
          description="naitive is designed for teams responsible for running complex deals end-to-end — coordinating stakeholders, managing review and diligence, and moving work forward across fragmented systems."
          image={<PlatformPreviewDealPipeline />}
        />
        
        <HomepageScrollingTags />
        
        <HomepageFeatureSection
          title="Accurate, Organized Lender Tracking"
          description="naitive seamlessly integrates your lender relationships with deal flow, maintaining visibility, organization, and real-time status across your entire process."
          image={<PlatformPreviewLenderKanban />}
          reverse
        />
        
        <HomepageFeatureSection
          title="Leverage Your Firm's Workflows"
          description="Use tools designed to create work outputs exactly as you would — organized data rooms, milestone tracking, and automated document management."
          image={<PlatformPreviewDataRoom />}
        />
        
        <HomepageTestimonials />
        
        <HomepageDataPrivacy />
        
        <HomepageCTA />
        
        <HomepageFooter />
      </div>
    </>
  );
}
