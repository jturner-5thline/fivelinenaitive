import { Helmet } from "react-helmet-async";
import {
  HomepageHeader,
  HomepageHero,
  HomepageStatsBar,
  HomepageFeatureGrid,
  HomepageWorkflow,
  HomepageFeatureSection,
  HomepageScrollingTags,
  HomepageTestimonials,
  HomepageDataPrivacy,
  HomepageCTA,
  HomepageFooter,
  HomepageFromBlog,
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

      <div
        className="dark min-h-screen relative"
        style={{
          colorScheme: 'dark',
          background:
            'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)',
          backgroundAttachment: 'fixed',
        }}
      >
        <HomepageHeader />
        
        <HomepageHero />

        {/* Scrolling capability tags — full-width banner directly under hero */}
        <div className="scroll-reveal">
          <HomepageScrollingTags />
        </div>

        {/* Feature grid — 5 modules */}
        <div className="scroll-reveal-soft">
          <HomepageFeatureGrid />
        </div>

        {/* Feature deep dives with platform previews */}
        <div className="scroll-reveal-soft">
          <HomepageFeatureSection
            title="The Operating System for Deal Management"
            description="naitive is designed for teams responsible for running complex deals end-to-end — coordinating stakeholders, managing review and diligence, and moving work forward across fragmented systems."
            image={<PlatformPreviewDealPipeline />}
          />
        </div>

        <div className="scroll-reveal-soft">
          <HomepageFeatureSection
            title="Centralized Lender Management"
            description="Track lender outreach, review, and term sheets directly within the deal — without spreadsheets, side channels, or manual handoffs. As lenders move through each stage, activity is captured in context, giving teams a clear, real-time view of where the deal stands and what needs attention next."
            image={<PlatformPreviewLenderKanban />}
            reverse
          />
        </div>

        <div className="scroll-reveal-soft">
          <HomepageFeatureSection
            title="Execution-Ready Data Rooms"
            description="Organize diligence materials directly within the deal — with progress, ownership, and status tracked as execution unfolds. Checklists, documents, and milestones stay connected to the transaction, giving teams a clear view of what's complete, what's pending, and what needs attention next."
            image={<PlatformPreviewDataRoom />}
          />
        </div>

        {/* Workflow — numbered steps + deal card stack */}
        <div className="scroll-reveal-soft">
          <HomepageWorkflow />
        </div>

        {/* Audience */}
        <div className="scroll-reveal-soft">
          <HomepageTestimonials />
        </div>

        {/* Data & Privacy */}
        <div className="scroll-reveal-soft">
          <HomepageDataPrivacy />
        </div>

        {/* From the Blog — hides itself when no published posts */}
        <div className="scroll-reveal-soft">
          <HomepageFromBlog />
        </div>

        {/* Final CTA */}
        <div className="scroll-reveal-soft">
          <HomepageCTA />
        </div>

        <HomepageFooter />
      </div>
    </>
  );
}
