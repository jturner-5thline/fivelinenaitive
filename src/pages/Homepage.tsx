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
          description="Track lender outreach, review, and term sheets directly within the deal — without spreadsheets, side channels, or manual handoffs. As lenders move through each stage, activity is captured in context, giving teams a clear, real-time view of where the deal stands and what needs attention next."
          image={<PlatformPreviewLenderKanban />}
          reverse
        />
        
        <HomepageFeatureSection
          title="Execution-Ready Data Rooms"
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
