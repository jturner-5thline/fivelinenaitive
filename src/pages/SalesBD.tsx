import { Helmet } from "react-helmet-async";
import { Users, Handshake, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useState } from "react";
import { Building2, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PartnerSourcedDeals } from "@/components/partners/PartnerSourcedDeals";
import { ReferralSourceDeals } from "@/components/partners/ReferralSourceDeals";
import { ReEngagementInsights } from "@/components/partners/ReEngagementInsights";
import { ReferralsNeedingAttention } from "@/components/partners/ReferralsNeedingAttention";
import { PartnerInsightsFeed, type InsightsSource } from "@/components/partners/PartnerInsightsFeed";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ChannelsBoard } from "@/components/channels/ChannelsBoard";
import { ChannelsDashboard } from "@/components/channels/ChannelsDashboard";
import { ReferralSourcesView } from "@/components/channels/ReferralSourcesView";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { CrmUpdateQueueButton } from "@/components/crm/CrmUpdateQueueButton";

const PartnersPipeline = lazy(() => import("./PartnersPipeline"));

export default function SalesBD() {
  const [activeTab, setActiveTab] = useState("overview");
  const [channelsSubView, setChannelsSubView] = useState<"channels" | "companies" | "referral-sources">("channels");
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const [insightsSource, setInsightsSource] = useState<InsightsSource>("all");
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;

  return (
    <>
      <Helmet>
        <title>Sales & BD | 5thLine</title>
      </Helmet>
      <div className="popup-shell-surface min-h-screen">
        <DashboardPage
          padding="sm"
          wrapper={(children) => (
            <Tabs value={activeTab} onValueChange={setActiveTab}>{children}</Tabs>
          )}
          header={
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Sales & BD</h1>
                  <p className="text-muted-foreground mt-1">
                    Manage your sales pipeline and business development activities
                  </p>
                </div>
                <CrmUpdateQueueButton />
              </div>
              <TabsList>
                <TabsTrigger value="overview" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Overview
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
                <div className="space-y-6">
                  {/* Sub-navigation */}
                  <div className="flex items-center gap-1 bg-muted/40 backdrop-blur-xl border border-border rounded-lg p-0.5 w-fit">
                    <button
                      onClick={() => setChannelsSubView("channels")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                        channelsSubView === "channels"
                          ? "bg-background/60 text-foreground border border-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/30 border border-transparent"
                      }`}
                    >
                      <Network className="h-3.5 w-3.5" />
                      Channels
                    </button>
                    <button
                      onClick={() => setChannelsSubView("companies")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                        channelsSubView === "companies"
                          ? "bg-background/60 text-foreground border border-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/30 border border-transparent"
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Companies
                    </button>
                    <button
                      onClick={() => setChannelsSubView("referral-sources")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                        channelsSubView === "referral-sources"
                          ? "bg-background/60 text-foreground border border-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/30 border border-transparent"
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">Partners and Referrals Insights</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Activity, alerts, and follow-ups across partners and referral sources</p>
                    </div>
                    <div className="flex items-center bg-muted/40 backdrop-blur-xl border border-border rounded-lg p-0.5 gap-0.5">
                      {([
                        { value: 'all', label: 'All' },
                        { value: 'partners', label: 'Partners only' },
                        { value: 'referrals', label: 'Referral Sources only' },
                      ] as { value: InsightsSource; label: string }[]).map(o => (
                        <button
                          key={o.value}
                          onClick={() => setInsightsSource(o.value)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                            insightsSource === o.value
                              ? 'bg-background/60 text-foreground border border-border'
                              : 'text-muted-foreground hover:text-foreground hover:bg-background/30'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <PartnerInsightsFeed sourceFilter={insightsSource} />
                    {insightsSource !== 'referrals' && (
                      <ReEngagementInsights onViewPartner={(id) => setViewPartnerId(id)} />
                    )}
                  </div>
                  {insightsSource !== 'partners' && <ReferralsNeedingAttention />}
                </div>
                <PartnerSourcedDeals />
                <ReferralSourceDeals />
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
