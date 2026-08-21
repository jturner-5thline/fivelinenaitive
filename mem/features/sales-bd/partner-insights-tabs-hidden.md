---
name: Sales & BD Activity / Needs Attention tabs hidden
description: Partner + Referral Insights (Activity / Needs Attention) tab widgets removed from /sales-bd; exact restore steps
type: feature
---
User hid the Activity / Needs Attention insight tabs on `src/pages/SalesBD.tsx` (both the Partners & Channels tab and the Referral Sources tab). Components still exist and are unused elsewhere on this page.

**To restore exactly:**
1. Re-add imports:
```tsx
import { ReEngagementInsights } from "@/components/partners/ReEngagementInsights";
import { ReferralsNeedingAttention } from "@/components/partners/ReferralsNeedingAttention";
import { PartnerInsightsFeed, PartnerInsightsProvider, PartnerInsightsHeaderActions, PartnerInsightsTabLabel } from "@/components/partners/PartnerInsightsFeed";
```
2. In `TabsContent value="partners-channels"`, replace the standalone `<PartnerSourcedDeals kpisOnly ... />` with:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div className="space-y-4">
    <PartnerInsightsProvider>
    <Tabs defaultValue="activity">
      <div className="flex items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="activity"><PartnerInsightsTabLabel label="Activity" kind="activity" /></TabsTrigger>
          <TabsTrigger value="attention"><PartnerInsightsTabLabel label="Needs Attention" kind="attention" /></TabsTrigger>
        </TabsList>
        <PartnerInsightsHeaderActions />
      </div>
      <TabsContent value="activity" className="mt-4">
        <PartnerInsightsFeed sourceFilter="partners" />
      </TabsContent>
      <TabsContent value="attention" className="mt-4">
        <ReEngagementInsights onViewPartner={(id) => setViewPartnerId(id)} />
      </TabsContent>
    </Tabs>
    </PartnerInsightsProvider>
  </div>
  <PartnerSourcedDeals kpisOnly kpiGridClassName="grid grid-cols-1 gap-3 auto-rows-fr h-full" />
</div>
```
3. In `TabsContent value="referral-sources"`, mirror the same block with `sourceFilter="referrals"`, `<ReferralsNeedingAttention />`, and
`<ReferralSourceDeals kpisOnly kpiGridClassName="grid grid-cols-2 gap-3 auto-rows-fr h-full" />`.
