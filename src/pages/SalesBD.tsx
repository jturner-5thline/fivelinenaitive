import { Helmet } from "react-helmet-async";
import { Users, Handshake, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useState } from "react";
import { Building2, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PartnersByStageCards } from "@/components/partners/PartnersByStageCards";
import { PartnerSourcedDeals } from "@/components/partners/PartnerSourcedDeals";
import { ReEngagementInsights } from "@/components/partners/ReEngagementInsights";
import { PartnerInsightsFeed } from "@/components/partners/PartnerInsightsFeed";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ChannelsBoard } from "@/components/channels/ChannelsBoard";
import { ChannelsDashboard } from "@/components/channels/ChannelsDashboard";
import { ReferralSourcesView } from "@/components/channels/ReferralSourcesView";

const PartnersPipeline = lazy(() => import("./PartnersPipeline"));

export default function SalesBD() {
  const [activeTab, setActiveTab] = useState("overview");
  const [channelsSubView, setChannelsSubView] = useState<"companies" | "referral-sources">("companies");
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;

  const navigateToStage = (stageId: string) => {
    setActiveTab("partners-pipeline");
  };

  return (
    <>
      <Helmet>
        <title>Sales & BD | 5thLine</title>
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto py-8 px-4">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Sales & BD</h1>
            <p className="text-muted-foreground mt-1">
              Manage your sales pipeline and business development activities
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="channels" className="gap-1.5">
                <Network className="h-3.5 w-3.5" /> Channels
              </TabsTrigger>
              <TabsTrigger value="partners-pipeline" className="gap-1.5">
                <Handshake className="h-3.5 w-3.5" /> Partners Pipeline
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-8">
                <PartnersByStageCards onNavigateToStage={navigateToStage} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <PartnerInsightsFeed />
                  <ReEngagementInsights onViewPartner={(id) => setViewPartnerId(id)} />
                </div>
                <PartnerSourcedDeals />
              </div>
            </TabsContent>

            <TabsContent value="channels">
              <div className="space-y-8">
                <ChannelsDashboard />
                <div className="border-t border-border/30 pt-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">Companies by Channel</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Each column is a channel. Cards are individual companies and contacts within that channel.</p>
                  </div>
                  <ChannelsBoard />
                </div>
                <div className="border-t border-border/30 pt-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">Referral Sources</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Contacts who have referred deals in Active or In Development pipelines, sorted by total referred volume.</p>
                  </div>
                  <ReferralSourcesView />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="partners-pipeline">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <PartnersPipeline />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <PartnerDetailPanel partner={viewPartner} onClose={() => setViewPartnerId(null)} />
    </>
  );
}
