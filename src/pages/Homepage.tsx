import { Helmet } from "react-helmet-async";
import { HomepageHeader } from "@/components/homepage/HomepageHeader";
import { HomepageHero } from "@/components/homepage/HomepageHero";
import { HomepageScrollingTags } from "@/components/homepage/HomepageScrollingTags";
import { HomepageOperatingSections } from "@/components/homepage/HomepageOperatingSections";
import { HomepageFooter } from "@/components/homepage/HomepageFooter";

export default function Homepage() {
  return <>
    <Helmet>
      <title>naitive | The Operating System for Deal Management</title>
      <meta name="description" content="Centralizing deal execution into one operating system. Connect work, decisions, lenders and data from mandate to close with naitive." />
      <meta property="og:title" content="naitive | The Operating System for Deal Management" />
      <meta property="og:description" content="Centralizing deal execution into one operating system. Connect work, decisions, lenders and data from mandate to close with naitive." />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
    <div className="dark homepage-os min-h-screen bg-background text-foreground">
      <HomepageHeader />
      <main><HomepageHero /><HomepageScrollingTags /><HomepageOperatingSections /></main>
      <HomepageFooter />
    </div>
  </>;
}
