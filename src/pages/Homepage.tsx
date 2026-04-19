import { Helmet } from "react-helmet-async";
import {
  HomepageHeader,
  HomepageHero,
  HomepageValueProp,
  HomepageStatsBar,
  HomepageFeatureGrid,
  HomepageWorkflow,
  HomepageFeatureSection,
  HomepageScrollingTags,
  HomepageTestimonials,
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

      <div
        className="dark min-h-screen bg-[hsl(265,35%,5%)] relative"
        style={{
          colorScheme: 'dark',
          backgroundImage:
            'radial-gradient(ellipse 90% 70% at 100% 0%, hsl(270, 50%, 14%) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 0% 100%, hsl(260, 45%, 11%) 0%, transparent 65%), linear-gradient(180deg, hsl(268, 40%, 7%) 0%, hsl(262, 38%, 5%) 100%)',
          backgroundAttachment: 'fixed',
        }}
      >
        <HomepageHeader />
        
        <HomepageHero />

        {/* Scrolling capability tags — full-width banner directly under hero */}
        <div className="scroll-reveal">
          <HomepageScrollingTags />
        </div>

        {/* Narrative intro */}
        <div className="scroll-reveal-soft">
          <HomepageValueProp />
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
            title="Centralized Lender Management, Without the Noise"
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

        {/* Final CTA */}
        <div className="scroll-reveal-soft">
          <HomepageCTA />
        </div>

        <HomepageFooter />
      </div>
    </>
  );
}
