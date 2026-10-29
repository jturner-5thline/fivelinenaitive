import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Settings as SettingsIcon, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReferralSourceDeals } from "@/components/partners/ReferralSourceDeals";
import { PartnerDetailPanel } from "@/components/partners/PartnerDetailPanel";
import { usePartners } from "@/hooks/usePartnersPipeline";
import { ReferralSourceMetricWidgets } from "@/components/channels/ReferralSourceMetricWidgets";
import { ReferralConversionWidget } from "@/components/channels/ReferralConversionWidget";
import { ReferralSourcePipelineWidget } from "@/components/partners/ReferralSourcePipelineWidget";
import { ChannelEntityDetailModal } from "@/components/channels/ChannelEntityDetailModal";
import type { ChannelEntry } from "@/hooks/useChannelEntries";
import { CrmUpdateQueueButton } from "@/components/crm/CrmUpdateQueueButton";
import { Button } from "@/components/ui/button";
import { useCanEditPartnerRules } from "@/hooks/usePartnerRules";
import { SalesBdDateRangeProvider } from "@/contexts/SalesBdDateRangeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PartnerRulesSettings } from "@/components/settings/PartnerRulesSettings";

/**
 * Sales & BD — now rendered as a dashboard inside the Insights page
 * (previously the standalone `/sales-bd` route). Same widgets, same data;
 * only the page chrome was dropped in favour of the Insights shell.
 */
function SalesBdDashboardInner() {
  const [viewPartnerId, setViewPartnerId] = useState<string | null>(null);
  const [viewChannelEntry, setViewChannelEntry] = useState<ChannelEntry | null>(null);
  const [search, setSearch] = useState<string>('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data: partners = [] } = usePartners();
  const viewPartner = viewPartnerId ? partners.find(p => p.id === viewPartnerId) || null : null;
  const canEditPartnerRules = useCanEditPartnerRules();
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderSlot(document.getElementById('qir-header-actions-slot'));
  }, []);

  return (
    <div className="sales-bd-page bg-transparent">
      <div>
        {headerSlot && createPortal(
          <div className="flex items-center gap-2">
            <CrmUpdateQueueButton className="h-9 rounded-md" />
            {canEditPartnerRules && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-md"
                title="Rules & Definitions"
                aria-label="Rules & Definitions"
                onClick={() => setRulesOpen(true)}
              >
                <SettingsIcon className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>,
          headerSlot,
        )}
      </div>

      <div className="mx-auto max-w-[1400px] space-y-6">
        <ReferralSourceMetricWidgets
          belowSourcesSlot={
            <ReferralSourceDeals
              kpisOnly
              kpiKeys={['board', 'referred']}
              kpiGridClassName="grid grid-cols-2 gap-3"
            />
          }
          sideSlot={
            <ReferralSourceDeals
              kpisOnly
              kpiKeys={['conversion']}
              kpiGridClassName="grid grid-cols-1 gap-3 h-full"
            />
          }
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ReferralConversionWidget />
        </div>
        {/* Referral Insights (Activity / Needs Attention) hidden — see mem://features/sales-bd/partner-insights-tabs-hidden */}

        <ReferralSourcePipelineWidget
          search={search}
          onOpenPartner={setViewPartnerId}
          searchSlot={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sources, companies, channels…"
                aria-label="Search referral sources"
                className="h-7 w-64 pl-7 pr-7 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          }
        />
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
