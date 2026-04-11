import { Helmet } from "react-helmet-async";
import { Users, Handshake, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PartnersByStageCards } from "@/components/partners/PartnersByStageCards";
import { PartnerSourcedDeals } from "@/components/partners/PartnerSourcedDeals";
import { ReEngagementInsights } from "@/components/partners/ReEngagementInsights";
import { PartnerInsightsFeed } from "@/components/partners/PartnerInsightsFeed";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ChannelsBoard } from "@/components/channels/ChannelsBoard";
import { ChannelsDashboard } from "@/components/channels/ChannelsDashboard";

const PartnersPipeline = lazy(() => import("./PartnersPipeline"));

export default function SalesBD() {
  const [activeTab, setActiveTab] = useState("overview");
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
              <ChannelsBoard />
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
