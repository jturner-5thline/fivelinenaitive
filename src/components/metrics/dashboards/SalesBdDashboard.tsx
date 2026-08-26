import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { ReferralSourceDeals } from "@/components/partners/ReferralSourceDeals";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ReferralSourcesView } from "@/components/channels/ReferralSourcesView";
import { ReferralSourceMetricWidgets } from "@/components/channels/ReferralSourceMetricWidgets";
import { ReferralSourcePipelineWidget } from "@/components/partners/ReferralSourcePipelineWidget";
import { ChannelEntityDetailModal } from "@/components/channels/ChannelEntityDetailModal";
import type { ChannelEntry } from "@/hooks/useChannelEntries";
import { SalesBdSearch } from "@/components/partners/SalesBdSearch";
import { CrmUpdateQueueButton } from "@/components/crm/CrmUpdateQueueButton";
import { Button } from "@/components/ui/button";
import { useCanEditPartnerRules } from "@/hooks/usePartnerRules";
import { SalesBdDateRangeProvider, useSalesBdDateRange } from "@/contexts/SalesBdDateRangeContext";
import { InsightsTimeRangeSelector } from "@/components/insights/InsightsTimeRangeSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PartnerRulesSettings } from "@/components/settings/PartnerRulesSettings";

function SalesBdRangeSelector() {
  const { setRange } = useSalesBdDateRange();
  return (
    <InsightsTimeRangeSelector boardId="sales-bd" defaultPresetId="ytd" onChange={setRange} />
  );
}

/**
 * Sales & BD — now rendered as a dashboard inside the Insights page
 * (previously the standalone `/sales-bd` route). Same widgets, same data;
 * only the page chrome was dropped in favour of the Insights shell.
 */
function SalesBdDashboardInner() {
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const [viewChannelEntry, setViewChannelEntry] = useState<ChannelEntry | null>(null);
  const [referralSearchSeed, setReferralSearchSeed] = useState<string>('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;
  const canEditPartnerRules = useCanEditPartnerRules();

  return (
    <div className="sales-bd-page bg-transparent">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <SalesBdSearch
          onSelectPartner={(p) => setViewPartnerId(p.id)}
          onSelectChannelEntry={(e) => setViewChannelEntry(e)}
          onSelectReferralSource={(r) => setReferralSearchSeed(r.name)}
        />
        <SalesBdRangeSelector />
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

        <ReferralSourcePipelineWidget />
        <ReferralSourceDeals hideKpis />

        <ReferralSourcesView hideKpis initialSearch={referralSearchSeed} />
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
              Contact tier rules and partner attribution settings configured for the Sales & BD dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <PartnerRulesSettings />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SalesBdDashboard() {
  return (
    <SalesBdDateRangeProvider>
      <SalesBdDashboardInner />
    </SalesBdDateRangeProvider>
  );
}
