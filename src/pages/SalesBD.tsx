import { Helmet } from "react-helmet-async";
import { Handshake, Network, Settings as SettingsIcon, UserCheck, ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { lazy, Suspense, useState } from "react";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ReferralSourceDeals } from "@/components/partners/ReferralSourceDeals";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ChannelsBoard } from "@/components/channels/ChannelsBoard";
import { ChannelsDashboard } from "@/components/channels/ChannelsDashboard";
import { ReferralSourcesView } from "@/components/channels/ReferralSourcesView";
import { ReferralSourceMetricWidgets } from "@/components/channels/ReferralSourceMetricWidgets";
import { ChannelEntityDetailModal } from "@/components/channels/ChannelEntityDetailModal";
import type { ChannelEntry } from "@/hooks/useChannelEntries";
import { SalesBdSearch } from "@/components/partners/SalesBdSearch";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { CrmUpdateQueueButton } from "@/components/crm/CrmUpdateQueueButton";
import { Button } from "@/components/ui/button";
import { useCanEditPartnerRules } from "@/hooks/usePartnerRules";
import { SalesBdDateRangeProvider, useSalesBdDateRange } from "@/contexts/SalesBdDateRangeContext";
import { InsightsTimeRangeSelector } from "@/components/insights/InsightsTimeRangeSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PartnerRulesSettings } from "@/components/settings/PartnerRulesSettings";

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

const TOP_TABS = [
  { value: "partners-channels", label: "Partners & Channels", Icon: Handshake },
  { value: "referral-sources", label: "Referral Sources", Icon: UserCheck },
] as const;

function SalesBDInner() {
  const [activeTab, setActiveTab] = useState("partners-channels");
  const [channelsSubView, setChannelsSubView] = useState<"pipeline" | "channels" | "companies">("pipeline");
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const [viewChannelEntry, setViewChannelEntry] = useState<ChannelEntry | null>(null);
  const [referralSearchSeed, setReferralSearchSeed] = useState<string>('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;
  const canEditPartnerRules = useCanEditPartnerRules();
  const activeTopTab = TOP_TABS.find((t) => t.value === activeTab) ?? TOP_TABS[0];

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
                </div>
                <div className="flex items-center gap-2">
                  <SalesBdSearch
                    onSelectPartner={(p) => {
                      setActiveTab("partners-channels");
                      setViewPartnerId(p.id);
                    }}
                    onSelectChannelEntry={(e) => {
                      setActiveTab("partners-channels");
                      setChannelsSubView("channels");
                      setViewChannelEntry(e);
                    }}
                    onSelectReferralSource={(r) => {
                      setActiveTab("referral-sources");
                      setReferralSearchSeed(r.name);
                    }}
                  />
                  <SalesBdHeaderRangeSelector />
                  {canEditPartnerRules && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      title="Rules & Definitions"
                      aria-label="Rules & Definitions"
                      onClick={() => setRulesOpen(true)}
                    >
                      <SettingsIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <CrmUpdateQueueButton />
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <activeTopTab.Icon className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{activeTopTab.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {TOP_TABS.map(({ value, label, Icon }) => (
                    <DropdownMenuItem key={value} onSelect={() => setActiveTab(value)} className="gap-2 text-xs">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        >
            <TabsContent value="partners-channels" className="mt-4">
              <div className="space-y-8">
                {/* Partner widgets (KPI tiles + charts) hidden — see mem://features/sales-bd/partner-insights-tabs-hidden */}
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
              </div>
            </TabsContent>

            <TabsContent value="referral-sources" className="mt-4">
              <div className="space-y-8">
                <ReferralSourceMetricWidgets
                  sideSlot={
                    <ReferralSourceDeals
                      kpisOnly
                      kpiGridClassName="grid h-full grid-cols-2 sm:grid-cols-3 grid-rows-2 gap-3 auto-rows-fr"
                    />
                  }
                />
                {/* Referral Insights (Activity / Needs Attention) hidden — see mem://features/sales-bd/partner-insights-tabs-hidden */}

                <ReferralSourceDeals hideKpis />
                <ReferralSourcesView hideKpis initialSearch={referralSearchSeed} />
              </div>
            </TabsContent>
        </DashboardPage>
      </div>

      <PartnerDetailPanel partner={viewPartner} onClose={() => setViewPartnerId(null)} />
      {viewChannelEntry && (
        <ChannelEntityDetailModal entry={viewChannelEntry} onClose={() => setViewChannelEntry(null)} />
      )}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sales & BD Rules & Definitions</DialogTitle>
            <DialogDescription>
              Contact tier rules and partner attribution settings configured for the Sales & BD page.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <PartnerRulesSettings />
          </div>
        </DialogContent>
      </Dialog>
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
