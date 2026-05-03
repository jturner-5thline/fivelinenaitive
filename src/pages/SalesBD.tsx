import { Helmet } from "react-helmet-async";
import { Users, Handshake, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useState } from "react";
import { Building2, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PartnersByStageCards } from "@/components/partners/PartnersByStageCards";
import { PartnerSourcedDeals } from "@/components/partners/PartnerSourcedDeals";
import { ReEngagementInsights } from "@/components/partners/ReEngagementInsights";
import { ReferralsNeedingAttention } from "@/components/partners/ReferralsNeedingAttention";
import { PartnerInsightsFeed } from "@/components/partners/PartnerInsightsFeed";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ChannelsBoard } from "@/components/channels/ChannelsBoard";
import { ChannelsDashboard } from "@/components/channels/ChannelsDashboard";
import { ReferralSourcesView } from "@/components/channels/ReferralSourcesView";
import { DashboardPage } from "@/components/layout/DashboardPage";

const PartnersPipeline = lazy(() => import("./PartnersPipeline"));

export default function SalesBD() {
  const [activeTab, setActiveTab] = useState("overview");
  const [channelsSubView, setChannelsSubView] = useState<"channels" | "companies" | "referral-sources">("channels");
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
        <DashboardPage
          padding="sm"
          wrapper={(children) => (
            <Tabs value={activeTab} onValueChange={setActiveTab}>{children}</Tabs>
          )}
          header={
            <>
              <div className="mb-3">
                <h1 className="text-3xl font-bold tracking-tight">Sales & BD</h1>
                <p className="text-muted-foreground mt-1">
                  Manage your sales pipeline and business development activities
                </p>
              </div>
              <TabsList>
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
            </>
          }
        >
            <TabsContent value="overview" className="mt-4">
              <div className="space-y-8">
                <PartnersByStageCards onNavigateToStage={navigateToStage} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <PartnerInsightsFeed />
                  <ReEngagementInsights onViewPartner={(id) => setViewPartnerId(id)} />
                </div>
                <ReferralsNeedingAttention />
                <PartnerSourcedDeals />
              </div>
            </TabsContent>

            <TabsContent value="channels" className="mt-4">
              <div className="space-y-6">
                {/* Sub-navigation */}
                <div className="flex items-center gap-1 bg-[hsl(260,20%,14%,0.5)] backdrop-blur-xl border border-[hsl(260,30%,45%,0.1)] ring-1 ring-inset ring-white/[0.03] rounded-lg p-0.5 w-fit shadow-[0_2px_8px_hsl(0,0%,0%,0.2)]">
                  <button
                    onClick={() => setChannelsSubView("channels")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                      channelsSubView === "channels"
                        ? "bg-[hsl(263,60%,55%,0.2)] text-primary shadow-[0_0_8px_hsl(263,60%,55%,0.15)] border border-[hsl(263,50%,55%,0.15)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border border-transparent"
                    }`}
                  >
                    <Network className="h-3.5 w-3.5" />
                    Channels
                  </button>
                  <button
                    onClick={() => setChannelsSubView("companies")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                      channelsSubView === "companies"
                        ? "bg-[hsl(263,60%,55%,0.2)] text-primary shadow-[0_0_8px_hsl(263,60%,55%,0.15)] border border-[hsl(263,50%,55%,0.15)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border border-transparent"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Companies
                  </button>
                  <button
                    onClick={() => setChannelsSubView("referral-sources")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                      channelsSubView === "referral-sources"
                        ? "bg-[hsl(263,60%,55%,0.2)] text-primary shadow-[0_0_8px_hsl(263,60%,55%,0.15)] border border-[hsl(263,50%,55%,0.15)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border border-transparent"
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Referral Sources
                  </button>
                </div>

                {channelsSubView === "channels" && <ChannelsDashboard />}

                {channelsSubView === "companies" && (
                  <div>
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold">Companies by Channel</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Each column is a channel. Cards are individual companies and contacts within that channel.</p>
                    </div>
                    <ChannelsBoard />
                  </div>
                )}

                {channelsSubView === "referral-sources" && <ReferralSourcesView />}
              </div>
            </TabsContent>

            <TabsContent value="partners-pipeline" className="mt-4">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <PartnersPipeline />
              </Suspense>
            </TabsContent>
        </DashboardPage>
      </div>

      <PartnerDetailPanel partner={viewPartner} onClose={() => setViewPartnerId(null)} />
    </>
  );
}
