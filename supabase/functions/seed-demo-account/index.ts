import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { seedDemoInbox, type SeedDemoInboxResult } from "../_shared/seedDemoInbox.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_DEMO_EMAIL = "demo@5thline.co";
const DEFAULT_DEMO_PASSWORD = "Demo2024!";
const DEFAULT_DEMO_COMPANY_NAME = "5th Line Demo";
const DEMO_TAG = "demo";

// 5th Line company settings (cloned from real company)
const COMPANY_SETTINGS = {
  deal_stages: [
    { id: "on-hold", label: "Deal/Diligence Paused/On Hold", color: "bg-muted" },
    { id: "ndaneeds-list-sent", label: "NDA/Needs List Sent", color: "bg-amber-500" },
    { id: "pre-credit-needs", label: "Pre-Credit Needs", color: "bg-slate-500" },
    { id: "initial-lender-review", label: "Initial Lender Review", color: "bg-fuchsia-500" },
    { id: "initial-feedback", label: "Initial Feedback", color: "bg-slate-500" },
    { id: "proposal-in-development", label: "Proposal In Development", color: "bg-cyan-500" },
    { id: "proposal-issued", label: "Proposal Issued", color: "bg-blue-500" },
    { id: "agreement-pending", label: "Agreement Pending", color: "bg-orange-500" },
    { id: "final-credit-items", label: "Final Credit Items", color: "bg-slate-500" },
    { id: "client-strategy-review", label: "Client Strategy Review", color: "bg-blue-500" },
    { id: "write-up-pending", label: "Write-Up Pending", color: "bg-indigo-500" },
    { id: "submitted-to-lenders", label: "Submitted to Lenders", color: "bg-violet-500" },
    { id: "lenders-in-review", label: "Lenders in Review", color: "bg-purple-500" },
    { id: "terms-issued", label: "Terms Issued", color: "bg-fuchsia-500" },
    { id: "in-due-diligence", label: "In Due Diligence", color: "bg-amber-500" },
    { id: "funded-invoiced", label: "Funded / Invoiced", color: "bg-cyan-500" },
    { id: "closed-won", label: "Closed Won", color: "bg-success" },
    { id: "closed-lost", label: "Closed Lost", color: "bg-destructive" },
  ],
  deal_info_layout: {
    order: ["narrative","dealManager","dealOwner","type","engagement","analyst","exclusivity","companyUrl","businessModel","clientContact","referralSource","hoursAndFees"],
    visibility: { narrative: true, dealManager: true, dealOwner: true, type: true, engagement: true, analyst: true, exclusivity: true, companyUrl: true, businessModel: true, clientContact: true, referralSource: true, hoursAndFees: true },
  },
  deal_panel_layout: {
    order: ["deal-information","outstanding-items","activity-timeline","ai-research","ai-assistant","ai-activity-summary","ai-suggestions"],
    visibility: { "deal-information": true, "outstanding-items": true, "activity-timeline": false, "ai-research": false, "ai-assistant": false, "ai-activity-summary": false, "ai-suggestions": false },
  },
  permission_settings: {
    lenderEdit: { allowMembersToEditMilestones: true, allowMembersToEditNotes: true, allowMembersToEditStage: true, allowedRoles: ["owner","admin","member"] },
  },
  lender_matching_config: {
    criteria: [
      { enabled: true, id: "deal_size", label: "Deal Size", position: 1, weight: 50 },
      { enabled: true, id: "deal_type", label: "Deal Type", position: 2, weight: 40 },
      { enabled: true, id: "cash_burn", label: "Cash Burn OK", position: 3, weight: 30 },
      { enabled: true, id: "industry", label: "Industry", position: 4, weight: 25 },
      { enabled: true, id: "sponsorship", label: "Sponsorship", position: 5, weight: 20 },
      { enabled: true, id: "geography", label: "Geography", position: 6, weight: 10 },
      { enabled: true, id: "b2b_b2c", label: "B2B/B2C", position: 7, weight: 8 },
    ],
    penalties: { above_max_deal: -30, below_min_deal: -30, cash_burn_mismatch: -25, industry_avoided: -50, sponsorship_mismatch: -20 },
  },
};

// 20 Lenders with complete profiles
const DEMO_LENDERS = [
  { name: "Apex Venture Lending", lender_type: "Venture Debt", tier: "Tier 1", geo: "National", loan_types: ["venture debt","growth capital"], industries: ["Technology","SaaS","Healthcare"], industries_to_avoid: ["Cannabis","Gambling"], min_deal: 5000000, max_deal: 50000000, min_revenue: 10000000, cash_burn: "OK", sponsorship: "Not Required", b2b_b2c: "B2B", refinancing: "Yes", contact_name: "Mark Sullivan", contact_title: "Managing Director", email: "msullivan@apexvl.com", contact_phone: "(415) 555-0101", company_requirements: "Min 12 months runway", deal_structure_notes: "Warrants required, 3yr term typical" },
  { name: "Ironclad Asset Partners", lender_type: "ABL", tier: "Tier 1", geo: "National", loan_types: ["abl","revolving credit"], industries: ["Manufacturing","Distribution","Retail"], industries_to_avoid: ["Oil & Gas"], min_deal: 10000000, max_deal: 100000000, min_revenue: 25000000, cash_burn: "No", sponsorship: "Preferred", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Jennifer Park", contact_title: "Senior Vice President", email: "jpark@ironcladap.com", contact_phone: "(212) 555-0202", company_requirements: "EBITDA positive preferred", deal_structure_notes: "Flexible on structure, competitive rates" },
  { name: "Bridgeport Growth Capital", lender_type: "Growth Capital", tier: "Tier 1", geo: "Northeast / Mid-Atlantic", loan_types: ["growth capital","term loan"], industries: ["Technology","Healthcare","Business Services"], industries_to_avoid: ["Real Estate","Construction"], min_deal: 3000000, max_deal: 25000000, min_revenue: 5000000, cash_burn: "OK (limited)", sponsorship: "Not Required", b2b_b2c: "B2B", refinancing: "Case by case", contact_name: "David Chen", contact_title: "Partner", email: "dchen@bridgeportgc.com", contact_phone: "(617) 555-0303", company_requirements: "Strong recurring revenue base", deal_structure_notes: "Revenue-based lending, no warrants below $10M" },
  { name: "Stride Revenue Finance", lender_type: "Revenue-Based", tier: "Tier 2", geo: "National", loan_types: ["revenue-based financing","growth capital"], industries: ["SaaS","Technology","E-commerce"], industries_to_avoid: ["Healthcare devices"], min_deal: 1000000, max_deal: 15000000, min_revenue: 2000000, cash_burn: "OK", sponsorship: "Not Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Sarah Kim", contact_title: "Director", email: "skim@striderfin.com", contact_phone: "(650) 555-0404", company_requirements: "Min $2M ARR for SaaS", deal_structure_notes: "No personal guarantees, flexible repayment" },
  { name: "Forge Industrial Credit", lender_type: "Term Loan", tier: "Tier 2", geo: "National", loan_types: ["term loan","mezzanine"], industries: ["Manufacturing","Distribution","Food & Beverage"], industries_to_avoid: ["Cannabis","Crypto"], min_deal: 5000000, max_deal: 30000000, min_revenue: 15000000, ebitda_min: 2000000, cash_burn: "No", sponsorship: "Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Robert Martinez", contact_title: "Managing Director", email: "rmartinez@forgecredit.com", contact_phone: "(312) 555-0505", company_requirements: "Positive EBITDA required", deal_structure_notes: "Senior secured, 4-5yr terms" },
  { name: "Cumulus Cloud Lending", lender_type: "Venture Debt", tier: "Tier 1", geo: "National", loan_types: ["venture debt","line of credit"], industries: ["SaaS","Cloud Infrastructure"], industries_to_avoid: ["Hardware","Biotech"], min_deal: 2000000, max_deal: 20000000, min_revenue: 3000000, cash_burn: "OK", sponsorship: "Not Required", b2b_b2c: "B2B", refinancing: "Yes", contact_name: "Amanda Torres", contact_title: "VP Originations", email: "atorres@cumuluslend.com", contact_phone: "(503) 555-0606", company_requirements: "MRR >$250K, net revenue retention >100%", deal_structure_notes: "No equity component, interest-only periods available" },
  { name: "Keystone Commercial Finance", lender_type: "ABL", tier: "Tier 2", geo: "National", loan_types: ["abl","factoring","purchase order financing"], industries: ["Manufacturing","Distribution","Staffing"], industries_to_avoid: ["Technology"], min_deal: 1000000, max_deal: 25000000, min_revenue: 5000000, cash_burn: "No", sponsorship: "Not Required", b2b_b2c: "B2B", refinancing: "Yes", contact_name: "Chris Johnson", contact_title: "Regional Manager", email: "cjohnson@keystonecf.com", contact_phone: "(504) 555-0707", company_requirements: "Strong AR/Inventory base", deal_structure_notes: "Advance rates up to 90% on eligible AR" },
  { name: "Pinnacle Innovation Fund", lender_type: "Growth Equity", tier: "Tier 1", geo: "West Coast", loan_types: ["growth capital","convertible note"], industries: ["Technology","Fintech","AI/ML"], industries_to_avoid: ["Oil & Gas","Mining"], min_deal: 10000000, max_deal: 75000000, min_revenue: 20000000, cash_burn: "OK (path to profitability)", sponsorship: "Preferred", b2b_b2c: "B2B", refinancing: "No", contact_name: "Lisa Wang", contact_title: "Partner", email: "lwang@pinnaclefund.com", contact_phone: "(415) 555-0808", company_requirements: "Series B+ with clear path to profitability", deal_structure_notes: "Structured equity, board seat optional" },
  { name: "Ridgeline Mezzanine Partners", lender_type: "Mezzanine", tier: "Tier 2", geo: "Southeast / National", loan_types: ["mezzanine","subordinated debt"], industries: ["Healthcare","Business Services","Consumer"], industries_to_avoid: ["Restaurants","Retail fashion"], min_deal: 5000000, max_deal: 35000000, min_revenue: 10000000, ebitda_min: 3000000, cash_burn: "No", sponsorship: "Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Thomas Wright", contact_title: "Senior Managing Director", email: "twright@ridgelinemezz.com", contact_phone: "(704) 555-0909", company_requirements: "Stable cash flows, PE-backed preferred", deal_structure_notes: "Junior capital, PIK interest options" },
  { name: "Compass Growth Advisors", lender_type: "Growth Capital", tier: "Tier 2", geo: "Midwest / National", loan_types: ["growth capital","term loan","line of credit"], industries: ["Healthcare","Education","Government Services"], industries_to_avoid: ["Cannabis","Gambling"], min_deal: 3000000, max_deal: 20000000, min_revenue: 8000000, cash_burn: "No", sponsorship: "Not Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Karen Foster", contact_title: "Director of Originations", email: "kfoster@compassga.com", contact_phone: "(314) 555-1010", company_requirements: "Government contracts a plus", deal_structure_notes: "Flexible terms, NMTC eligible" },
  { name: "Summit Senior Lending", lender_type: "Senior Debt", tier: "Tier 1", geo: "National", loan_types: ["senior secured","term loan","revolving credit"], industries: ["Technology","Healthcare","Business Services","Manufacturing"], industries_to_avoid: ["Real Estate"], min_deal: 15000000, max_deal: 100000000, min_revenue: 30000000, ebitda_min: 5000000, cash_burn: "No", sponsorship: "Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "James O'Brien", contact_title: "Managing Partner", email: "jobrien@summitsl.com", contact_phone: "(212) 555-1111", company_requirements: "Sponsor-backed, established track record", deal_structure_notes: "Unitranche capability, hold sizes up to $50M" },
  { name: "Cascade Revenue Partners", lender_type: "Revenue-Based", tier: "Tier 2", geo: "US & Canada", loan_types: ["revenue-based financing"], industries: ["SaaS","Technology"], industries_to_avoid: ["Hardware","Gaming"], min_deal: 500000, max_deal: 10000000, min_revenue: 1500000, cash_burn: "OK", sponsorship: "Not Required", b2b_b2c: "B2B", refinancing: "Yes", contact_name: "Michelle Lee", contact_title: "Business Development", email: "mlee@cascaderp.com", contact_phone: "(604) 555-1212", company_requirements: "Predictable recurring revenue", deal_structure_notes: "Revenue share repayment, no dilution" },
  { name: "Titan Growth Finance", lender_type: "Venture Debt", tier: "Tier 1", geo: "National", loan_types: ["venture debt","growth capital","term loan"], industries: ["Technology","Life Sciences","SaaS"], industries_to_avoid: ["Consumer retail"], min_deal: 20000000, max_deal: 200000000, min_revenue: 25000000, cash_burn: "OK", sponsorship: "Preferred", b2b_b2c: "B2B", refinancing: "Yes", contact_name: "Patricia Gonzalez", contact_title: "Senior Director", email: "pgonzalez@titangf.com", contact_phone: "(650) 555-1313", company_requirements: "Strong institutional backing, Series C+", deal_structure_notes: "Large hold capacity, flexible structures" },
  { name: "Nimble Capital Group", lender_type: "Revenue-Based", tier: "Tier 3", geo: "National", loan_types: ["revenue-based financing","line of credit"], industries: ["SaaS","Technology","E-commerce"], industries_to_avoid: ["Hardware","Biotech"], min_deal: 100000, max_deal: 4000000, min_revenue: 500000, cash_burn: "OK (limited)", sponsorship: "Not Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Brian Murphy", contact_title: "Account Executive", email: "bmurphy@nimblecg.com", contact_phone: "(206) 555-1414", company_requirements: "Min 6 months revenue history", deal_structure_notes: "Non-dilutive, quick close, automated underwriting" },
  { name: "Vanguard Tech Bank", lender_type: "Commercial Bank", tier: "Tier 1", geo: "National", loan_types: ["venture debt","revolving credit","term loan"], industries: ["Technology","Life Sciences","Fintech","Healthcare IT"], industries_to_avoid: ["Cannabis"], min_deal: 5000000, max_deal: 150000000, min_revenue: 10000000, cash_burn: "OK", sponsorship: "Preferred", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Rachel Kim", contact_title: "Relationship Manager", email: "rkim@vanguardtb.com", contact_phone: "(408) 555-1515", company_requirements: "VC-backed with strong cap table", deal_structure_notes: "Full banking relationship, competitive rates for depositors" },
  { name: "Westmark Venture Partners", lender_type: "Venture Debt", tier: "Tier 2", geo: "West Coast / National", loan_types: ["venture debt","growth capital"], industries: ["Technology","SaaS","Clean Energy"], industries_to_avoid: ["Real Estate","Agriculture"], min_deal: 2000000, max_deal: 25000000, min_revenue: 3000000, cash_burn: "OK", sponsorship: "Not Required", b2b_b2c: "B2B", refinancing: "Case by case", contact_name: "Andrew Patel", contact_title: "Vice President", email: "apatel@westmarkvp.com", contact_phone: "(408) 555-1616", company_requirements: "Strong unit economics", deal_structure_notes: "Warrants typically required, flexible on structure" },
  { name: "Zenith Technology Finance", lender_type: "Venture Debt", tier: "Tier 1", geo: "National", loan_types: ["venture debt","term loan"], industries: ["Technology","Life Sciences","Healthcare IT","Sustainability"], industries_to_avoid: ["Oil & Gas"], min_deal: 5000000, max_deal: 30000000, min_revenue: 5000000, cash_burn: "OK", sponsorship: "Preferred", b2b_b2c: "Both", refinancing: "Yes", contact_name: "Daniel Brooks", contact_title: "Managing Director", email: "dbrooks@zenithtf.com", contact_phone: "(860) 555-1717", company_requirements: "Institutional VC backing preferred", deal_structure_notes: "End-of-term payments, flexible drawdown" },
  { name: "Presto Merchant Capital", lender_type: "Revenue-Based", tier: "Tier 3", geo: "US & Canada", loan_types: ["revenue-based financing","merchant cash advance"], industries: ["E-commerce","DTC","SaaS"], industries_to_avoid: ["B2B Services","Manufacturing"], min_deal: 100000, max_deal: 10000000, min_revenue: 1000000, cash_burn: "OK", sponsorship: "Not Required", b2b_b2c: "B2C", refinancing: "Yes", contact_name: "Samantha Cole", contact_title: "Growth Manager", email: "scole@prestomc.com", contact_phone: "(416) 555-1818", company_requirements: "Connected revenue data required", deal_structure_notes: "Revenue share model, no fixed repayment schedule" },
  { name: "Launchpad Growth Capital", lender_type: "Growth Capital", tier: "Tier 1", geo: "National", loan_types: ["growth capital","term loan","delayed draw"], industries: ["Technology","Healthcare","SaaS","Fintech"], industries_to_avoid: ["Cannabis","Gambling"], min_deal: 10000000, max_deal: 75000000, min_revenue: 15000000, cash_burn: "OK (path to profitability)", sponsorship: "Preferred", b2b_b2c: "B2B", refinancing: "Yes", contact_name: "Michael Torres", contact_title: "Partner", email: "mtorres@launchpadgc.com", contact_phone: "(650) 555-1919", company_requirements: "Late-stage with clear growth trajectory", deal_structure_notes: "Flexible structures, warrants negotiable" },
  { name: "Citadel Direct Lending", lender_type: "Senior/Unitranche", tier: "Tier 1", geo: "National", loan_types: ["unitranche","senior secured","revolving credit","term loan"], industries: ["Healthcare","Technology","Business Services","Industrial"], industries_to_avoid: [], min_deal: 30000000, max_deal: 500000000, min_revenue: 50000000, ebitda_min: 10000000, cash_burn: "No", sponsorship: "Required", b2b_b2c: "Both", refinancing: "Yes", contact_name: "William Chang", contact_title: "Managing Director", email: "wchang@citadeldl.com", contact_phone: "(310) 555-2020", company_requirements: "PE-sponsored, middle market", deal_structure_notes: "Large hold capacity, full capital solutions" },
];

const DEMO_MANAGERS = ["Paz Piña", "Niki Heikali", "James Turner", "Val V"];
const DEMO_ANALYSTS = ["Sarah Chen", "Michael Roberts", "Jennifer Walsh", null];
const ENGAGEMENT_TYPES = ["guided", "advisory", "managed-process"];
const DEAL_TYPES_OPTIONS = [
  '["growth-capital"]',
  '["refinancing"]',
  '["growth-capital","refinancing"]',
  '["acquisition-financing"]',
  '["abl","growth-capital"]',
  '["refinancing","growth-capital"]',
];

// 15 deals at various stages
const DEMO_DEALS = [
  { company: "Meridian Software Co", value: 12000000, status: "on-track", stage: "lenders-in-review", engagement_type: "managed-process", deal_type: '["growth-capital","refinancing"]', manager: "Niki Heikali", analyst: "Sarah Chen", contact: "Tom Bradley", contact_info: "tom@meridiansw.com", business_model: "B2B SaaS", company_url: "meridiansoftware.com", narrative: "High-growth SaaS platform seeking refinancing of existing credit facility and additional growth capital. Strong net revenue retention at 125%.", exclusivity: "Exclusive", referred_by: "Referral Partner", success_fee_percent: 1.5, pre_signing_hours: 40, post_signing_hours: 60 },
  { company: "Atlas Logistics Group", value: 35000000, status: "on-track", stage: "terms-issued", engagement_type: "managed-process", deal_type: '["refinancing","growth-capital"]', manager: "Niki Heikali", analyst: "Michael Roberts", contact: "Diana Prince", contact_info: "diana@atlaslogistics.com", business_model: "3PL / Asset-Light", company_url: "atlaslogistics.com", narrative: "National 3PL operator refinancing existing ABL facility. Strong EBITDA margins and growing customer base.", exclusivity: "Exclusive", referred_by: "Direct", success_fee_percent: 1.0, pre_signing_hours: 50, post_signing_hours: 80 },
  { company: "Beacon Health Analytics", value: 8500000, status: "at-risk", stage: "in-due-diligence", engagement_type: "advisory", deal_type: '["growth-capital"]', manager: "James Turner", analyst: "Jennifer Walsh", contact: "Dr. Sarah Mills", contact_info: "smills@beaconhealth.io", business_model: "Healthcare SaaS", company_url: "beaconhealth.io", narrative: "AI-powered clinical analytics platform. Series A backed, growing rapidly but burning cash. Need to address lender concerns around profitability timeline.", exclusivity: "Non-Exclusive", referred_by: "Goldman Sachs", success_fee_percent: 1.5 },
  { company: "Redwood Manufacturing", value: 22000000, status: "on-track", stage: "submitted-to-lenders", engagement_type: "guided", deal_type: '["refinancing"]', manager: "Paz Piña", analyst: "Sarah Chen", contact: "Robert Chen", contact_info: "rchen@redwoodmfg.com", business_model: "Contract Manufacturing", company_url: "redwoodmfg.com", narrative: "PE-backed contract manufacturer seeking to refinance senior secured debt at better terms. Strong EBITDA of $6M on $45M revenue.", exclusivity: "Exclusive", referred_by: "JP Morgan", success_fee_percent: 1.0 },
  { company: "Vertex Cloud Solutions", value: 6000000, status: "on-track", stage: "write-up-pending", engagement_type: "guided", deal_type: '["growth-capital"]', manager: "Paz Piña", analyst: null, contact: "Alex Kim", contact_info: "akim@vertexcloud.io", business_model: "Cloud Infrastructure", company_url: "vertexcloud.io", narrative: "Cloud infrastructure startup with $4M ARR growing 80% YoY. Seeking growth capital to expand sales team.", exclusivity: "Exclusive", referred_by: "Direct" },
  { company: "Summit Hospitality Group", value: 45000000, status: "off-track", stage: "pre-credit-needs", engagement_type: "managed-process", deal_type: '["acquisition-financing"]', manager: "Niki Heikali", analyst: "Michael Roberts", contact: "Maria Santos", contact_info: "msantos@summithospitality.com", business_model: "Hotel Management", company_url: "summithospitality.com", narrative: "Acquisition financing for 3-property portfolio. Needs list still being compiled, client slow to respond.", exclusivity: "Exclusive", referred_by: "Bank of America" },
  { company: "NovaPay Technologies", value: 18000000, status: "on-track", stage: "initial-lender-review", engagement_type: "advisory", deal_type: '["growth-capital","refinancing"]', manager: "James Turner", analyst: "Sarah Chen", contact: "Kevin Zhao", contact_info: "kzhao@novapay.com", business_model: "Fintech / Payments", company_url: "novapay.com", narrative: "Payment processing platform with strong unit economics. Currently in initial conversations with select lenders.", exclusivity: "Exclusive", referred_by: "Morgan Stanley", success_fee_percent: 1.5 },
  { company: "GreenField AgriTech", value: 15000000, status: "on-hold", stage: "on-hold", engagement_type: "guided", deal_type: '["growth-capital"]', manager: "Paz Piña", analyst: "Jennifer Walsh", contact: "Emily Foster", contact_info: "efoster@greenfieldagri.com", business_model: "AgTech SaaS", company_url: "greenfieldagri.com", narrative: "Agricultural technology platform paused while client evaluates strategic alternatives including potential M&A.", exclusivity: "Non-Exclusive", referred_by: "Referral Partner" },
  { company: "Pinnacle Data Systems", value: 28000000, status: "on-track", stage: "proposal-issued", engagement_type: "managed-process", deal_type: '["refinancing","growth-capital"]', manager: "Niki Heikali", analyst: "Michael Roberts", contact: "Jason Park", contact_info: "jpark@pinnacledata.com", business_model: "Data Center Services", company_url: "pinnacledata.com", narrative: "Data center operator seeking to refinance and expand. Proposal issued, awaiting client signature on engagement letter.", exclusivity: "Exclusive", referred_by: "Direct", success_fee_percent: 1.5, pre_signing_hours: 30 },
  { company: "Coastal Brands Inc", value: 5500000, status: "at-risk", stage: "initial-feedback", engagement_type: "guided", deal_type: '["abl","growth-capital"]', manager: "Niki Heikali", analyst: null, contact: "Lauren White", contact_info: "lwhite@coastalbrands.com", business_model: "DTC Consumer Brands", company_url: "coastalbrands.com", narrative: "Portfolio of DTC brands seeking ABL facility. Lender feedback mixed due to consumer exposure and seasonal revenue.", exclusivity: "Non-Exclusive", referred_by: "Direct" },
  { company: "Nexus Engineering", value: 20000000, status: "on-track", stage: "agreement-pending", engagement_type: "advisory", deal_type: '["refinancing"]', manager: "Paz Piña", analyst: "Sarah Chen", contact: "David Mitchell", contact_info: "dmitchell@nexuseng.com", business_model: "Engineering Services", company_url: "nexuseng.com", narrative: "PE-backed engineering firm refinancing existing debt. Agreement nearly finalized, expected to close within 2 weeks.", exclusivity: "Exclusive", referred_by: "Goldman Sachs", success_fee_percent: 1.0, pre_signing_hours: 25, post_signing_hours: 40 },
  { company: "Blueshift AI", value: 10000000, status: "on-track", stage: "client-strategy-review", engagement_type: "guided", deal_type: '["growth-capital"]', manager: "James Turner", analyst: "Jennifer Walsh", contact: "Nina Patel", contact_info: "npatel@blueshiftai.com", business_model: "Enterprise AI", company_url: "blueshiftai.com", narrative: "Enterprise AI company with strong pipeline. Reviewing strategy with client before going to market.", exclusivity: "Exclusive", referred_by: "Referral Partner" },
  { company: "Pacific Distribution Co", value: 40000000, status: "on-track", stage: "funded-invoiced", engagement_type: "managed-process", deal_type: '["refinancing","growth-capital"]', manager: "Niki Heikali", analyst: "Michael Roberts", contact: "Steve Nakamura", contact_info: "snakamura@pacificdist.com", business_model: "National Distribution", company_url: "pacificdist.com", narrative: "Successfully funded ABL facility with Ironclad Asset Partners. Invoice submitted, awaiting payment.", exclusivity: "Exclusive", referred_by: "Bank of America", success_fee_percent: 1.0 },
  { company: "TrueNorth EdTech", value: 7000000, status: "archived", stage: "closed-won", engagement_type: "advisory", deal_type: '["growth-capital"]', manager: "Paz Piña", analyst: null, contact: "Rachel Green", contact_info: "rgreen@truenorthed.com", business_model: "EdTech SaaS", company_url: "truenorthed.com", narrative: "Successfully closed growth capital round with Bridgeport Growth Capital. Deal completed Q4 2025.", exclusivity: "Exclusive", referred_by: "Direct", success_fee_percent: 1.5 },
  { company: "Iron Bridge Construction", value: 30000000, status: "archived", stage: "closed-lost", engagement_type: "managed-process", deal_type: '["acquisition-financing"]', manager: "James Turner", analyst: "Sarah Chen", contact: "Frank Russo", contact_info: "frusso@ironbridgeconstruction.com", business_model: "Commercial Construction", company_url: "ironbridgeconstruction.com", narrative: "Acquisition financing fell through due to buyer's inability to secure equity commitment. Deal terminated.", exclusivity: "Exclusive", referred_by: "JP Morgan" },
];

// Lender assignments per deal (index into DEMO_LENDERS)
const DEAL_LENDER_ASSIGNMENTS: { dealIdx: number; lenderIdxs: number[]; stages: string[]; trackingStatuses: string[] }[] = [
  { dealIdx: 0, lenderIdxs: [0, 1, 3, 7], stages: ["reviewing-drl", "management-call-completed", "reviewing-drl", "introduced"], trackingStatuses: ["active", "active", "on-deck", "on-deck"] },
  { dealIdx: 1, lenderIdxs: [1, 10, 8], stages: ["term-sheets", "draft-terms", "passed"], trackingStatuses: ["active", "active", "passed"] },
  { dealIdx: 2, lenderIdxs: [5, 11, 2], stages: ["management-call-completed", "reviewing-drl", "inquiry-sent"], trackingStatuses: ["active", "on-deck", "on-deck"] },
  { dealIdx: 3, lenderIdxs: [4, 6, 9], stages: ["reviewing-drl", "reviewing-drl", "introduced"], trackingStatuses: ["active", "active", "on-deck"] },
  { dealIdx: 4, lenderIdxs: [2, 3], stages: ["inquiry-sent", "inquiry-sent"], trackingStatuses: ["on-deck", "on-deck"] },
  { dealIdx: 5, lenderIdxs: [10, 19], stages: ["inquiry-sent", "not-a-fit"], trackingStatuses: ["on-deck", "passed"] },
  { dealIdx: 6, lenderIdxs: [14, 18, 12, 16], stages: ["reviewing-drl", "reviewing-drl", "introduced", "introduced"], trackingStatuses: ["active", "active", "on-deck", "on-deck"] },
  { dealIdx: 8, lenderIdxs: [10, 4, 8, 18], stages: ["reviewing-drl", "inquiry-sent", "introduced", "introduced"], trackingStatuses: ["active", "on-deck", "on-deck", "on-deck"] },
  { dealIdx: 9, lenderIdxs: [6, 13], stages: ["reviewing-drl", "not-a-fit"], trackingStatuses: ["active", "passed"] },
  { dealIdx: 10, lenderIdxs: [4, 10, 19], stages: ["term-sheets", "draft-terms", "management-call-completed"], trackingStatuses: ["active", "active", "active"] },
  { dealIdx: 11, lenderIdxs: [2, 15, 5], stages: ["inquiry-sent", "inquiry-sent", "introduced"], trackingStatuses: ["on-deck", "on-deck", "on-deck"] },
  { dealIdx: 12, lenderIdxs: [1, 6, 9], stages: ["term-sheets", "passed", "passed"], trackingStatuses: ["active", "passed", "passed"] },
  { dealIdx: 13, lenderIdxs: [2], stages: ["term-sheets"], trackingStatuses: ["active"] },
  { dealIdx: 14, lenderIdxs: [10, 4, 8], stages: ["passed", "passed", "not-a-fit"], trackingStatuses: ["passed", "passed", "passed"] },
];

const MILESTONE_TEMPLATES = [
  "NDA/Needs List Sent",
  "Initial Client Call",
  "Financial Model Review",
  "Write-Up Draft Complete",
  "Lender Outreach Begin",
  "Management Presentations",
  "Term Sheet Received",
  "Due Diligence Kickoff",
  "Credit Approval",
  "Closing / Funding",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Parse optional overrides from body so this works for ANY new demo user.
    let DEMO_EMAIL = DEFAULT_DEMO_EMAIL;
    let DEMO_PASSWORD = DEFAULT_DEMO_PASSWORD;
    let DEMO_COMPANY_NAME = DEFAULT_DEMO_COMPANY_NAME;
    let firstName = "Demo";
    let lastName = "User";
    try {
      const body = await req.json().catch(() => ({} as any));
      if (body && typeof body === "object") {
        if (typeof body.email === "string" && body.email.includes("@")) {
          DEMO_EMAIL = body.email.trim().toLowerCase();
          DEMO_COMPANY_NAME = `${DEMO_EMAIL.split("@")[0]} Demo`;
        }
        if (typeof body.password === "string" && body.password.length >= 8) DEMO_PASSWORD = body.password;
        if (typeof body.companyName === "string" && body.companyName.trim()) DEMO_COMPANY_NAME = body.companyName.trim();
        if (typeof body.firstName === "string" && body.firstName.trim()) firstName = body.firstName.trim();
        if (typeof body.lastName === "string" && body.lastName.trim()) lastName = body.lastName.trim();
      }
    } catch {
      // ignore — defaults used
    }
    const fullName = `${firstName} ${lastName}`.trim();

    // 1. Create or get the demo user
    let userId: string;
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingDemo = existingUsers?.users?.find(u => u.email === DEMO_EMAIL);

    if (existingDemo) {
      userId = existingDemo.id;
      console.log("Demo user already exists:", userId);
      // Reset password
      await admin.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD });
    } else {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName },
      });
      if (createErr) throw createErr;
      userId = newUser.user.id;
      console.log("Created demo user:", userId);
    }

    // Update profile — disable ALL notifications for demo accounts
    await admin.from("profiles").upsert({
      user_id: userId,
      email: DEMO_EMAIL,
      display_name: fullName,
      first_name: firstName,
      last_name: lastName,
      onboarding_completed: true,
      approved_at: new Date().toISOString(),
      // Notification consent — opt-out until first-login modal accept
      notifications_opted_in: false,
      notifications_consent_shown: false,
      // Disable all notification preferences
      email_notifications: false,
      in_app_notifications: false,
      deal_updates_email: false,
      lender_updates_email: false,
      weekly_summary_email: false,
      email_task_assigned: false,
      notify_stale_alerts: false,
      notify_activity_lender_added: false,
      notify_activity_lender_updated: false,
      notify_activity_stage_changed: false,
      notify_activity_status_changed: false,
      notify_activity_milestone_added: false,
      notify_activity_milestone_completed: false,
      notify_activity_milestone_missed: false,
      notify_activity_deal_created: false,
      notify_flex_alerts: false,
      notify_info_request_emails: false,
    }, { onConflict: "user_id" });

    // 2. Create demo company
    let companyId: string;
    const { data: existingCompany } = await admin.from("companies").select("id").eq("name", DEMO_COMPANY_NAME).limit(1).single();
    
    if (existingCompany) {
      companyId = existingCompany.id;
      // Clean up old data
      await admin.from("deals").delete().eq("company_id", companyId);
      await admin.from("master_lenders").delete().eq("company_id", companyId);
      await admin.from("lender_notes").delete().eq("company_id", companyId);
      await admin.from("contacts").delete().eq("org_company_id", companyId);
      await admin.from("tasks").delete().eq("company_id", companyId);
    } else {
      const { data: newCompany, error: compErr } = await admin.from("companies").insert({
        name: DEMO_COMPANY_NAME,
        industry: "Finance & Banking",
        employee_size: "11-50",
        website_url: "5thline.co",
      }).select("id").single();
      if (compErr) throw compErr;
      companyId = newCompany.id;
    }

    // Flip the company into "seeding" mode so notification triggers no-op
    // for every insert that follows. We unset this in a finally-style block
    // at the end of the handler so a partial failure can't strand it on.
    await admin.from("companies").update({ is_seeding: true }).eq("id", companyId);

    // Add user to company
    await admin.from("company_members").upsert({
      user_id: userId,
      company_id: companyId,
      role: "owner",
    }, { onConflict: "user_id,company_id" }).select();

    // Ensure membership exists (upsert may not have onConflict matching)
    const { data: memberCheck } = await admin.from("company_members").select("id").eq("user_id", userId).eq("company_id", companyId).limit(1);
    if (!memberCheck || memberCheck.length === 0) {
      await admin.from("company_members").insert({ user_id: userId, company_id: companyId, role: "owner" });
    }

    // 3. Set company settings
    await admin.from("company_settings").upsert({
      company_id: companyId,
      ...COMPANY_SETTINGS,
    }, { onConflict: "company_id" });

    // 4. Set user data permissions (full access)
    const { data: existingPerms } = await admin.from("user_data_permissions").select("id").eq("user_id", userId).limit(1);
    if (!existingPerms || existingPerms.length === 0) {
      await admin.from("user_data_permissions").insert({
        user_id: userId,
        company_id: companyId,
        deals_scope: "all",
        lenders_scope: "all",
        analytics_scope: "all",
        reports_scope: "all",
        insights_scope: "all",
        can_export: true,
        can_bulk_edit: true,
        can_delete: true,
        can_view_financials: true,
        can_view_sensitive: true,
      });
    }

    // 4b. Disable deal summary emails for demo accounts
    await admin.from("user_deal_summary_preferences").upsert({
      user_id: userId,
      daily_deal_summary_enabled: false,
      weekly_deal_summary_enabled: false,
    }, { onConflict: "user_id" });

    // Wrap remaining seeding so we ALWAYS clear companies.is_seeding,
    // even on partial failure.
    let insertedLenders: { id: string; name: string }[] = [];
    let insertedDeals: { id: string; company: string; stage: string }[] = [];
    let insertedCrmCompanies: { id: string; name: string }[] = [];
    let insertedContacts: { id: string }[] = [];
    let dealLendersInsertedCount = 0;
    let tasksInsertedCount = 0;
    let milestonesToInsert: any[] = [];
    let activitiesToInsert: any[] = [];

    try {

    // ---- 5. Lenders: pick 10 most varied from the 20-strong catalog ----
    // Indexes chosen to span lender_type / tier / geo:
    // 0 Apex(VD,T1), 1 Ironclad(ABL,T1), 2 Bridgeport(GC,T1), 3 Stride(RBF,T2),
    // 4 Forge(TL,T2), 6 Keystone(ABL,T2), 8 Ridgeline(Mezz,T2),
    // 10 Summit(Senior,T1), 13 Nimble(RBF,T3), 19 Citadel(Senior/Unitranche,T1)
    const LENDER_PICK_IDXS = [0, 1, 2, 3, 4, 6, 8, 10, 13, 19];
    const pickedLenders = LENDER_PICK_IDXS.map((i) => DEMO_LENDERS[i]);

    const lendersToInsert = pickedLenders.map((l) => ({
      ...l,
      user_id: userId,
      company_id: companyId,
      active: true,
      tags: [DEMO_TAG],
    }));

    {
      const { data, error: lenderErr } = await admin.from("master_lenders").insert(lendersToInsert).select("id, name");
      if (lenderErr) throw lenderErr;
      insertedLenders = data || [];
      console.log(`Inserted ${insertedLenders.length} master lenders`);
    }

    // Create lender contacts for each
    const lenderContacts = insertedLenders.map((l, i) => ({
      lender_id: l.id,
      name: pickedLenders[i].contact_name,
      title: pickedLenders[i].contact_title,
      email: pickedLenders[i].email,
      phone: pickedLenders[i].contact_phone,
      is_primary: true,
      geography: pickedLenders[i].geo,
    }));
    await admin.from("lender_contacts").insert(lenderContacts);

    // Add some lender notes (indexes refer to the picked-10 array)
    const lenderNotesSample = [
      { idx: 0, note: "Strong relationship. They've been very responsive on recent deals.", is_flag: false },
      { idx: 1, note: "Competitive on ABL facilities. Can move quickly.", is_flag: false },
      { idx: 2, note: "Great for tech companies in the $3-15M range.", is_flag: false },
      { idx: 3, note: "Best option for SaaS-only deals. No equity component.", is_flag: false },
      { idx: 7, note: "Senior secured, large hold capacity. Plan for 60+ day close.", is_flag: false },
      { idx: 9, note: "Institutional quality. Very competitive on unitranche for PE-backed deals.", is_flag: false },
    ];

    const notesToInsert = lenderNotesSample.map((n) => ({
      lender_name: pickedLenders[n.idx].name,
      master_lender_id: insertedLenders[n.idx].id,
      author_user_id: userId,
      body: n.note,
      is_flag: n.is_flag,
      company_id: companyId,
    }));
    await admin.from("lender_notes").insert(notesToInsert);

    // ---- 6. Deals: pick 4, one per requested stage ----
    const REQUIRED_STAGES = [
      "initial-lender-review",
      "terms-issued",
      "in-due-diligence",
      "proposal-issued",
    ];
    const pickedDeals = REQUIRED_STAGES
      .map((s) => DEMO_DEALS.find((d) => d.stage === s))
      .filter(Boolean) as typeof DEMO_DEALS;

    const dealsToInsert = pickedDeals.map((d) => ({
      company: d.company,
      value: d.value,
      status: d.status,
      stage: d.stage,
      engagement_type: d.engagement_type,
      deal_type: d.deal_type,
      manager: d.manager,
      analyst: d.analyst || null,
      contact: d.contact,
      contact_info: d.contact_info,
      business_model: d.business_model,
      company_url: d.company_url,
      narrative: d.narrative,
      exclusivity: d.exclusivity || null,
      referred_by: d.referred_by || null,
      success_fee_percent: d.success_fee_percent || null,
      pre_signing_hours: d.pre_signing_hours || null,
      post_signing_hours: d.post_signing_hours || null,
      user_id: userId,
      company_id: companyId,
      tags: [DEMO_TAG],
    }));

    {
      const { data, error: dealErr } = await admin.from("deals").insert(dealsToInsert).select("id, company, stage");
      if (dealErr) throw dealErr;
      insertedDeals = data || [];
      console.log(`Inserted ${insertedDeals.length} deals`);
    }

    // ---- 7. Deal-lender relationships: 2-4 per deal, varied stages ----
    // Stages reference picked-10 lender indexes
    const DEMO_DL_PLAN: { lenderIdxs: number[]; stages: string[]; trackingStatuses: string[] }[] = [
      // Deal 0 (initial-lender-review): 4 lenders
      { lenderIdxs: [0, 2, 3, 7], stages: ["reviewing-drl", "inquiry-sent", "introduced", "introduced"], trackingStatuses: ["active", "on-deck", "on-deck", "on-deck"] },
      // Deal 1 (terms-issued): 3 lenders
      { lenderIdxs: [1, 5, 9], stages: ["term-sheets", "draft-terms", "passed"], trackingStatuses: ["active", "active", "passed"] },
      // Deal 2 (in-due-diligence): 3 lenders
      { lenderIdxs: [2, 4, 8], stages: ["management-call-completed", "reviewing-drl", "passed"], trackingStatuses: ["active", "active", "passed"] },
      // Deal 3 (proposal-issued): 2 lenders
      { lenderIdxs: [6, 9], stages: ["reviewing-drl", "introduced"], trackingStatuses: ["active", "on-deck"] },
    ];
    const dealLendersToInsert: any[] = [];
    for (let i = 0; i < insertedDeals.length; i++) {
      const deal = insertedDeals[i];
      const plan = DEMO_DL_PLAN[i];
      if (!plan) continue;
      for (let j = 0; j < plan.lenderIdxs.length; j++) {
        const li = plan.lenderIdxs[j];
        dealLendersToInsert.push({
          deal_id: deal.id,
          name: pickedLenders[li].name,
          stage: plan.stages[j],
          tracking_status: plan.trackingStatuses[j],
          notes: `Outreach initiated for ${deal.company}`,
          tags: [DEMO_TAG],
        });
      }
    }
    let insertedDealLenders: { id: string; deal_id: string; name: string }[] = [];
    if (dealLendersToInsert.length > 0) {
      const { data: dlData, error: dlErr } = await admin.from("deal_lenders").insert(dealLendersToInsert).select("id, deal_id, name");
      if (dlErr) console.error("Error inserting deal lenders:", dlErr);
      else {
        insertedDealLenders = dlData || [];
        dealLendersInsertedCount = insertedDealLenders.length;
        console.log(`Inserted ${dealLendersInsertedCount} deal lenders`);
      }
    }

    // ---- 7b. CRM companies (25) — first 4 match seeded deal companies ----
    const dealCompanyNames = insertedDeals.map((d) => d.company);
    const EXTRA_COMPANY_NAMES: { name: string; industry: string; employee_count: number; hq_state: string; domain: string }[] = [
      { name: "Northwind Robotics", industry: "Manufacturing", employee_count: 220, hq_state: "MI", domain: "northwindrobotics.com" },
      { name: "Lumen Health Group", industry: "Healthcare", employee_count: 410, hq_state: "MA", domain: "lumenhealth.io" },
      { name: "Brightline Logistics", industry: "Logistics", employee_count: 180, hq_state: "TX", domain: "brightlinelog.com" },
      { name: "Coral Apparel Co", industry: "Consumer", employee_count: 95, hq_state: "CA", domain: "coralapparel.com" },
      { name: "Crestwave Foods", industry: "Consumer", employee_count: 320, hq_state: "IL", domain: "crestwavefoods.com" },
      { name: "Helio Cloud", industry: "Technology", employee_count: 140, hq_state: "WA", domain: "heliocloud.io" },
      { name: "Quanta Diagnostics", industry: "Healthcare", employee_count: 76, hq_state: "PA", domain: "quantadx.com" },
      { name: "Forge & Bolt Industries", industry: "Manufacturing", employee_count: 260, hq_state: "OH", domain: "forgebolt.com" },
      { name: "Riverstone Distribution", industry: "Logistics", employee_count: 145, hq_state: "GA", domain: "riverstonedist.com" },
      { name: "Petal & Stem", industry: "Consumer", employee_count: 60, hq_state: "OR", domain: "petalandstem.com" },
      { name: "Sequoia Biotech", industry: "Healthcare", employee_count: 88, hq_state: "CA", domain: "sequoiabio.com" },
      { name: "Vantage Retail Co", industry: "Consumer", employee_count: 510, hq_state: "FL", domain: "vantageretail.com" },
      { name: "Pixel Forge Studios", industry: "Technology", employee_count: 55, hq_state: "NY", domain: "pixelforge.io" },
      { name: "Anvil Industrial Supply", industry: "Manufacturing", employee_count: 230, hq_state: "IN", domain: "anvilsupply.com" },
      { name: "Skyline Freight", industry: "Logistics", employee_count: 310, hq_state: "AZ", domain: "skylinefreight.com" },
      { name: "Verdant Wellness", industry: "Healthcare", employee_count: 110, hq_state: "CO", domain: "verdantwellness.com" },
      { name: "Atlas Snack Co", industry: "Consumer", employee_count: 175, hq_state: "NJ", domain: "atlassnack.com" },
      { name: "Granite Cloud Systems", industry: "Technology", employee_count: 95, hq_state: "VA", domain: "granitecloud.io" },
      { name: "Harbor Manufacturing Co", industry: "Manufacturing", employee_count: 280, hq_state: "WI", domain: "harbormfg.com" },
      { name: "Trailhead Outdoor Goods", industry: "Consumer", employee_count: 120, hq_state: "UT", domain: "trailheadoutdoor.com" },
      { name: "Northern Health Partners", industry: "Healthcare", employee_count: 220, hq_state: "MN", domain: "nhealthpartners.com" },
    ];
    const crmCompaniesToInsert: any[] = [];
    // 1) First 4 — match deal companies
    dealCompanyNames.forEach((name, i) => {
      const seedDeal = pickedDeals[i];
      crmCompaniesToInsert.push({
        name,
        domain: seedDeal?.company_url || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
        industry: "Technology",
        employee_count: 150 + i * 25,
        hq_state: "CA",
        org_company_id: companyId,
        owner_user_id: userId,
        created_by: userId,
        company_type: "prospect",
        lifecycle_stage: "opportunity",
        tags: [DEMO_TAG],
      });
    });
    // 2) 21 additional varied companies → total 25
    EXTRA_COMPANY_NAMES.forEach((c) => {
      crmCompaniesToInsert.push({
        name: c.name,
        domain: c.domain,
        industry: c.industry,
        employee_count: c.employee_count,
        hq_state: c.hq_state,
        org_company_id: companyId,
        owner_user_id: userId,
        created_by: userId,
        company_type: "prospect",
        lifecycle_stage: "target",
        tags: [DEMO_TAG],
      });
    });
    {
      const { data: crmData, error: crmErr } = await admin.from("crm_companies").insert(crmCompaniesToInsert).select("id, name");
      if (crmErr) console.error("Error inserting crm_companies:", crmErr);
      else {
        insertedCrmCompanies = crmData || [];
        console.log(`Inserted ${insertedCrmCompanies.length} crm_companies`);
      }
    }

    // Back-fill deal.crm_company_id for the 4 deals that have a matching company
    if (insertedCrmCompanies.length > 0 && insertedDeals.length > 0) {
      const byName = new Map(insertedCrmCompanies.map((c) => [c.name, c.id]));
      for (const d of insertedDeals) {
        const cid = byName.get(d.company);
        if (cid) {
          await admin.from("deals").update({ crm_company_id: cid }).eq("id", d.id);
        }
      }
    }

    // ---- 7c. Contacts (25) — at least 4 linked to seeded deals via crm_company_id ----
    const TITLES = ["CFO", "CEO", "Managing Director", "VP Finance", "Controller", "Head of FP&A", "COO", "Treasurer", "Director of Finance", "VP Operations"];
    const FIRSTS = ["Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor", "Quinn", "Rowan", "Blake", "Reese", "Hayden", "Cameron", "Drew", "Emerson", "Sage", "Logan", "Parker", "Skylar", "Devon", "Jamie", "Kennedy", "Marlowe", "Sloane", "Tatum", "Wren"];
    const LASTS = ["Walker", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hale", "Ito", "Joffe", "Khan", "Lopez", "Mendez", "Nair", "Oduya", "Park", "Quigley", "Reed", "Suarez", "Tran", "Underwood", "Vega", "Whitman", "Xu", "Yates"];
    const contactsToInsert: any[] = [];
    // First 4 contacts → linked to the 4 seeded deals (via matching crm_company_id)
    for (let i = 0; i < 25; i++) {
      const first = FIRSTS[i % FIRSTS.length];
      const last = LASTS[i % LASTS.length];
      const title = TITLES[i % TITLES.length];
      // Spread across the 25 crm_companies; first 4 take the first 4 (deal-linked)
      const company = insertedCrmCompanies[i % Math.max(1, insertedCrmCompanies.length)];
      const emailDomain = `demo${String(i + 1).padStart(2, "0")}.com`;
      contactsToInsert.push({
        first_name: first,
        last_name: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${emailDomain}`,
        phone_work: `(555) 010-${String(1000 + i).slice(-4)}`,
        job_title: title,
        crm_company_id: company?.id || null,
        owner_user_id: userId,
        created_by: userId,
        org_company_id: companyId,
        lifecycle_stage: i < 4 ? "opportunity" : "lead",
        tags: [DEMO_TAG],
      });
    }
    {
      const { data: contactsData, error: contactsErr } = await admin.from("contacts").insert(contactsToInsert).select("id, first_name, last_name, email, job_title");
      if (contactsErr) console.error("Error inserting contacts:", contactsErr);
      else {
        insertedContacts = contactsData || [];
        console.log(`Inserted ${insertedContacts.length} contacts`);
      }
    }

    // ---- 7d. Tasks (10) across the 4 deals ----
    const dayOffset = (d: number) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    };
    const tasksToInsert: any[] = [];
    for (let i = 0; i < insertedDeals.length; i++) {
      const deal = insertedDeals[i];
      // Two deal-level tasks per deal
      tasksToInsert.push({
        deal_id: deal.id,
        company_id: companyId,
        assigned_to: userId,
        assigned_by: userId,
        created_by: userId,
        title: `Send NDA package — ${deal.company}`,
        description: "Send NDA + needs list to qualified lenders.",
        due_date: dayOffset(-5 + i),
        status: "in_progress",
        priority: "high",
        task_type: "task",
        tags: [DEMO_TAG],
      });
      tasksToInsert.push({
        deal_id: deal.id,
        company_id: companyId,
        assigned_to: userId,
        assigned_by: userId,
        created_by: userId,
        title: `Prepare financial summary — ${deal.company}`,
        description: "Refresh trailing 12-month financial summary.",
        due_date: dayOffset(7 + i),
        status: "not_started",
        priority: "medium",
        task_type: "task",
        tags: [DEMO_TAG],
      });
      // One lender-level task referencing the first attached lender for this deal
      const firstLender = insertedDealLenders.find((l) => l.deal_id === deal.id);
      if (firstLender) {
        tasksToInsert.push({
          deal_id: deal.id,
          lender_id: firstLender.id,
          company_id: companyId,
          assigned_to: userId,
          assigned_by: userId,
          created_by: userId,
          title: `Follow up with ${firstLender.name}`,
          description: "Check on term sheet status and next steps.",
          due_date: dayOffset(i % 2 === 0 ? -3 : 10),
          status: "not_started",
          priority: i % 2 === 0 ? "high" : "medium",
          task_type: "task",
          tags: [DEMO_TAG],
        });
      }
    }
    if (tasksToInsert.length > 0) {
      const { error: tErr } = await admin.from("tasks").insert(tasksToInsert);
      if (tErr) console.error("Error inserting tasks:", tErr);
      else {
        tasksInsertedCount = tasksToInsert.length;
        console.log(`Inserted ${tasksInsertedCount} tasks`);
      }
    }

    // ---- 8. Milestones for active deals ----
    for (let i = 0; i < insertedDeals.length; i++) {
      const deal = insertedDeals[i];
      const stageIndex = COMPANY_SETTINGS.deal_stages.findIndex(s => s.id === deal.stage);
      const completedCount = Math.max(0, Math.min(stageIndex, MILESTONE_TEMPLATES.length));
      
      for (let m = 0; m < MILESTONE_TEMPLATES.length; m++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() - (MILESTONE_TEMPLATES.length - m) * 7 + 14);
        milestonesToInsert.push({
          deal_id: deal.id,
          user_id: userId,
          title: MILESTONE_TEMPLATES[m],
          position: m,
          completed: m < completedCount,
          completed_at: m < completedCount ? new Date(Date.now() - (completedCount - m) * 7 * 86400000).toISOString() : null,
          due_date: dueDate.toISOString(),
          status: m < completedCount ? "completed" : m === completedCount ? "in-progress" : "pending",
        });
      }
    }
    if (milestonesToInsert.length > 0) {
      const { error: msErr } = await admin.from("deal_milestones").insert(milestonesToInsert);
      if (msErr) console.error("Error inserting milestones:", msErr);
      else console.log(`Inserted ${milestonesToInsert.length} milestones`);
    }

    // 9. Insert activity logs
    const activityTypes = ["stage_change", "lender_added", "note_added", "milestone_completed", "deal_updated", "document_uploaded"];
    const activityDescriptions = [
      "Stage changed to {stage}",
      "Added {lender} to deal",
      "Added note: Initial assessment complete",
      "Milestone completed: {milestone}",
      "Updated deal information",
      "Uploaded financial model",
    ];
    for (let i = 0; i < insertedDeals.length; i++) {
      const deal = insertedDeals[i];
      const numActivities = 3 + Math.floor(Math.random() * 5);
      for (let a = 0; a < numActivities; a++) {
        const typeIdx = Math.floor(Math.random() * activityTypes.length);
        const hoursAgo = Math.floor(Math.random() * 720); // up to 30 days
        const createdAt = new Date(Date.now() - hoursAgo * 3600000);
        let desc = activityDescriptions[typeIdx]
          .replace("{stage}", deal.stage)
          .replace("{lender}", pickedLenders[Math.floor(Math.random() * pickedLenders.length)].name)
          .replace("{milestone}", MILESTONE_TEMPLATES[Math.floor(Math.random() * MILESTONE_TEMPLATES.length)]);
        activitiesToInsert.push({
          deal_id: deal.id,
          user_id: userId,
          activity_type: activityTypes[typeIdx],
          description: desc,
          user_display_name: DEMO_MANAGERS[Math.floor(Math.random() * DEMO_MANAGERS.length)],
          created_at: createdAt.toISOString(),
        });
      }
    }
    if (activitiesToInsert.length > 0) {
      const { error: actErr } = await admin.from("activity_logs").insert(activitiesToInsert);
      if (actErr) console.error("Error inserting activities:", actErr);
      else console.log(`Inserted ${activitiesToInsert.length} activity logs`);
    }

    } finally {
      // Always clear is_seeding so notification triggers resume.
      await admin.from("companies").update({ is_seeding: false }).eq("id", companyId);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Demo account created successfully",
      credentials: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      stats: {
        lenders: insertedLenders.length,
        deals: insertedDeals.length,
        dealLenders: dealLendersInsertedCount,
        crmCompanies: insertedCrmCompanies.length,
        contacts: insertedContacts.length,
        tasks: tasksInsertedCount,
        milestones: milestonesToInsert.length,
        activities: activitiesToInsert.length,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
