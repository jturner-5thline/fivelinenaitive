import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDeals from "./tools/list-deals";
import listPipelines from "./tools/list-pipelines";
import getDeal from "./tools/get-deal";
import updateDeal from "./tools/update-deal";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";
import completeTask from "./tools/complete-task";
import searchContacts from "./tools/search-contacts";
import getContact from "./tools/get-contact";
import searchCompanies from "./tools/search-companies";
import getCompany from "./tools/get-company";
import createContact from "./tools/create-contact";
import createCompany from "./tools/create-company";
import searchLenders from "./tools/search-lenders";
import getLender from "./tools/get-lender";
import addLenderToDeal from "./tools/add-lender-to-deal";
import searchDealNotes from "./tools/search-deal-notes";
import listDealActivity from "./tools/list-deal-activity";
import searchDealDocuments from "./tools/search-deal-documents";
import getDealDocument from "./tools/get-deal-document";
import searchDealEmails from "./tools/search-deal-emails";
import searchDealRecordings from "./tools/search-deal-recordings";
import listDealFundingSources from "./tools/list-deal-funding-sources";
import getDailyRundown from "./tools/get-daily-rundown";
import addDailyRundownItem from "./tools/add-daily-rundown-item";
import updateDailyRundownItem from "./tools/update-daily-rundown-item";
import completeDailyRundownItem from "./tools/complete-daily-rundown-item";
import reorderDailyRundownItems from "./tools/reorder-daily-rundown-items";
import listInsightsDashboards from "./tools/list-insights-dashboards";
import getPipelineMetrics from "./tools/get-pipeline-metrics";
import getFunnelVelocity from "./tools/get-funnel-velocity";
import getRevenueMetrics from "./tools/get-revenue-metrics";
import getLenderMetrics from "./tools/get-lender-metrics";
import getMetricTargets from "./tools/get-metric-targets";
import queryInsightsDataset from "./tools/query-insights-dataset";
import describeSchema from "./tools/describe-schema";

// The OAuth issuer MUST be the direct Supabase host (see cloud-auth-oauth-server).
// SUPABASE_URL on Lovable Cloud is a `.lovable.cloud` proxy; the token issuer is
// `https://<ref>.supabase.co/auth/v1`. VITE_SUPABASE_PROJECT_ID is inlined at
// build time so this stays import-safe (no runtime env read at module scope).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "naitive-api",
  title: "naitive API",
  version: "0.1.0",
  instructions:
    "Tools for the naitive deal-management platform. Callers act as the signed-in naitive user; all reads and writes respect the user's company scoping and access. Use `list_deals`/`get_deal` to inspect deals — `list_deals` applies NO implicit pipeline/owner/stage filter and returns deals from every pipeline the caller can see, with `total_count`/`next_offset`/`has_more` for full pagination and a `pipeline_breakdown`; pair it with `list_pipelines` (all pipelines, their stages and deal counts) to confirm coverage across pipelines — `update_deal` to move stage or edit fields, `list_tasks`/`create_task`/`complete_task` for task work, `search_contacts`/`search_companies`/`create_contact`/`create_company` for CRM lookups (both searches are paginated and accept fields=* for every column), `get_contact` for one contact's complete record plus linked company, deals, logged activities, field-level change history, AI field suggestions, attachments and funding-source/partner links, `get_company` for one CRM company's complete record plus its contacts, deals, full activity history, attachments, team, contact-match history, parent/child companies, linked funding sources and tasks, `search_lenders` (paginated directory search, fields=* returns every master_lenders column), `get_lender` (one funding source's complete record plus contacts, notes, attachments, change history and linked deals) and `add_lender_to_deal` for the funding-source directory, `list_deal_funding_sources` to read the lenders attached to a specific deal (matches the deal's Funding Sources tab), and — for deep deal context — `search_deal_notes`, `list_deal_activity`, `search_deal_documents`, `get_deal_document`, `search_deal_emails`, and `search_deal_recordings` to retrieve notes, timeline events, files, email history, and meeting transcripts scoped to a specific deal. Daily rundown tools (`get_daily_rundown`, `add_daily_rundown_item`, `update_daily_rundown_item`, `complete_daily_rundown_item`, `reorder_daily_rundown_items`) manage the personal dashboard rundown — access is restricted to jturner@5thline.co and enforced at the database (RLS) and edge-function layers. Insights analytics tools give full read access to everything on the Insights page: `list_insights_dashboards` enumerates dashboards, saved widget layouts, and custom formula metrics; `get_pipeline_metrics` returns deal-pipeline aggregates (value, fees, counts) broken down by stage, status, type, manager, owner, pipeline, and month for any timeframe; `get_funnel_velocity` returns stage conversion and time-in-stage analytics; `get_revenue_metrics` returns QuickBooks invoiced revenue by month/customer/entity plus P&L snapshots; `get_lender_metrics` returns funding-source funnel analytics; `get_metric_targets` returns Master Plan targets and manual inputs for plan-vs-actual comparisons; and `query_insights_dataset` is a read-only, fully paginated escape hatch over every underlying dataset (including deal write-ups, memos, checklists, attachments, financials and ownership). Use `describe_schema` first to discover exact column names and allowed enum values, then `list_deals` with fields=* to extract complete deal records in bulk across all pipelines. All of them apply the same global test-deal exclusions and RLS scoping as the UI.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listDeals,
    listPipelines,
    getDeal,
    updateDeal,
    listTasks,
    createTask,
    completeTask,
    searchContacts,
    getContact,
    searchCompanies,
    getCompany,
    createContact,
    createCompany,
    searchLenders,
    getLender,
    addLenderToDeal,
    searchDealNotes,
    listDealActivity,
    searchDealDocuments,
    getDealDocument,
    searchDealEmails,
    searchDealRecordings,
    listDealFundingSources,
    getDailyRundown,
    addDailyRundownItem,
    updateDailyRundownItem,
    completeDailyRundownItem,
    reorderDailyRundownItems,
    listInsightsDashboards,
    getPipelineMetrics,
    getFunnelVelocity,
    getRevenueMetrics,
    getLenderMetrics,
    getMetricTargets,
    queryInsightsDataset,
    describeSchema,
  ],
});