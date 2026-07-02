import { Helmet } from "react-helmet-async";
import { Handshake, Network, Settings as SettingsIcon, UserCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useState } from "react";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PartnerSourcedDeals } from "@/components/partners/PartnerSourcedDeals";
import { ReferralSourceDeals } from "@/components/partners/ReferralSourceDeals";
import { ReEngagementInsights } from "@/components/partners/ReEngagementInsights";
import { ReferralsNeedingAttention } from "@/components/partners/ReferralsNeedingAttention";
import { PartnerInsightsFeed } from "@/components/partners/PartnerInsightsFeed";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ChannelsBoard } from "@/components/channels/ChannelsBoard";
import { ChannelsDashboard } from "@/components/channels/ChannelsDashboard";
import { ReferralSourcesView } from "@/components/channels/ReferralSourcesView";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { CrmUpdateQueueButton } from "@/components/crm/CrmUpdateQueueButton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useCanEditPartnerRules } from "@/hooks/usePartnerRules";
import { SalesBdDateRangeProvider, useSalesBdDateRange } from "@/contexts/SalesBdDateRangeContext";
import { InsightsTimeRangeSelector } from "@/components/insights/InsightsTimeRangeSelector";

const PartnersPipeline = lazy(() => import("./PartnersPipeline"));

function SalesBdHeaderRangeSelector() {
  const { setRange } = useSalesBdDateRange();
  return (
    <InsightsTimeRangeSelector
      boardId="sales-bd"
      defaultPresetId="ytd"
      onChange={setRange}
    />
  );
}

function SalesBDInner() {
  const [activeTab, setActiveTab] = useState("partners-channels");
  const [channelsSubView, setChannelsSubView] = useState<"pipeline" | "channels" | "companies">("pipeline");
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;
  const canEditPartnerRules = useCanEditPartnerRules();

  return (
    <>
      <Helmet>
        <title>Sales & BD | 5thLine</title>
      </Helmet>
      <div className="sales-bd-page bg-transparent">
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
                <div className="flex items-center gap-2">
                  <SalesBdHeaderRangeSelector />
                  {canEditPartnerRules && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <Link to="/settings?tab=sales-bd" title="Configure tiers, stage criteria, and channel definitions">
                        <SettingsIcon className="h-3.5 w-3.5" />
                        Rules & Definitions
                      </Link>
                    </Button>
                  )}
                  <CrmUpdateQueueButton />
                </div>
              </div>
              <TabsList>
                <TabsTrigger value="partners-channels" className="gap-1.5">
                  <Handshake className="h-3.5 w-3.5" /> Partners & Channels
                </TabsTrigger>
                <TabsTrigger value="referral-sources" className="gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Referral Sources
                </TabsTrigger>
              </TabsList>
            </>
          }
        >
            <TabsContent value="partners-channels" className="mt-4">
              <div className="space-y-8">
                <PartnerSourcedDeals />
                <div className="space-y-6">
                  {/* Sub-navigation */}
                  <div className="flex items-center gap-1 bg-muted/40 backdrop-blur-xl border border-border rounded-lg p-0.5 w-fit">
                    <button
                      onClick={() => setChannelsSubView("pipeline")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                        channelsSubView === "pipeline"
                          ? "bg-background/60 text-foreground border border-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/30 border border-transparent"
                      }`}
                    >
                      <Handshake className="h-3.5 w-3.5" />
                      Partners Pipeline
                    </button>
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
                  </div>

                  {channelsSubView === "pipeline" && (
                    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                      <PartnersPipeline />
                    </Suspense>
                  )}

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
                </div>
                <div className="space-y-4 md:w-1/2">
                  <div>
                    <h2 className="text-lg font-semibold">Partners Insights</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Activity, alerts, and follow-ups across partners</p>
                  </div>
                  <Tabs defaultValue="activity">
                    <TabsList>
                      <TabsTrigger value="activity">Activity</TabsTrigger>
                      <TabsTrigger value="attention">Needing Attention</TabsTrigger>
                    </TabsList>
                    <TabsContent value="activity" className="mt-4">
                      <PartnerInsightsFeed sourceFilter="partners" />
                    </TabsContent>
                    <TabsContent value="attention" className="mt-4">
                      <ReEngagementInsights onViewPartner={(id) => setViewPartnerId(id)} />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="referral-sources" className="mt-4">
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Referral Sources Insights */}
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold">Referral Sources Insights</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Activity, alerts, and follow-ups across referral sources</p>
                    </div>
                    <Tabs defaultValue="activity">
                      <TabsList>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                        <TabsTrigger value="attention">Needing Attention</TabsTrigger>
                      </TabsList>
                      <TabsContent value="activity" className="mt-4">
                        <PartnerInsightsFeed sourceFilter="referrals" />
                      </TabsContent>
                      <TabsContent value="attention" className="mt-4">
                        <ReferralsNeedingAttention />
                      </TabsContent>
                    </Tabs>
                  </div>
                  {/* Right: 2×3 metric widgets */}
                  <ReferralSourceDeals
                    kpisOnly
                    kpiGridClassName="grid grid-cols-2 gap-3 auto-rows-fr h-full"
                  />
                </div>
                <ReferralSourceDeals hideKpis />
                <ReferralSourcesView hideKpis />
              </div>
            </TabsContent>
        </DashboardPage>
      </div>

      <PartnerDetailPanel partner={viewPartner} onClose={() => setViewPartnerId(null)} />
    </>
  );
}

export default function SalesBD() {
  return (
    <SalesBdDateRangeProvider>
      <SalesBDInner />
    </SalesBdDateRangeProvider>
  );
}
