import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDeals from "./tools/list-deals";
import listPipelines from "./tools/list-pipelines";
import getDeal from "./tools/get-deal";
import updateDeal from "./tools/update-deal";
import linkDealContact from "./tools/link-deal-contact";
import unlinkDealContact from "./tools/unlink-deal-contact";
import addDealAlias from "./tools/add-deal-alias";
import removeDealAlias from "./tools/remove-deal-alias";
import addDealStatusNote from "./tools/add-deal-status-note";
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
import updateLender from "./tools/update-lender";
import upsertLenderContact from "./tools/upsert-lender-contact";
import createLender from "./tools/create-lender";
import deleteLenderContact from "./tools/delete-lender-contact";
import addLenderAttachment from "./tools/add-lender-attachment";
import listLenderAttachments from "./tools/list-lender-attachments";
import deleteLenderAttachment from "./tools/delete-lender-attachment";
import addLenderToDeal from "./tools/add-lender-to-deal";
import updateDealLender from "./tools/update-deal-lender";
import searchDealNotes from "./tools/search-deal-notes";
import addDealNoteEntry from "./tools/add-deal-note-entry";
import getDealNote from "./tools/get-deal-note";
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
import listReferralPartners from "./tools/list-referral-partners";
import getSalesCallsWeekly from "./tools/get-sales-calls-weekly";
import getDealHoursFees from "./tools/get-deal-hours-fees";
import getCashflowMetrics from "./tools/get-cashflow-metrics";
import createLenderFitAttribute from "./tools/create-lender-fit-attribute";
import updateLenderFitAttribute from "./tools/update-lender-fit-attribute";
import deleteLenderFitAttribute from "./tools/delete-lender-fit-attribute";
import createLenderDisqualification from "./tools/create-lender-disqualification";
import updateLenderDisqualification from "./tools/update-lender-disqualification";
import deleteLenderDisqualification from "./tools/delete-lender-disqualification";
import createLenderDocFlag from "./tools/create-lender-doc-flag";
import updateLenderDocFlag from "./tools/update-lender-doc-flag";
import deleteLenderDocFlag from "./tools/delete-lender-doc-flag";
import createFundingSourceAcquisitionPlan from "./tools/create-funding-source-acquisition-plan";
import updateFundingSourceAcquisitionPlan from "./tools/update-funding-source-acquisition-plan";
import deleteFundingSourceAcquisitionPlan from "./tools/delete-funding-source-acquisition-plan";
import createLenderMatchRule from "./tools/create-lender-match-rule";
import updateLenderMatchRule from "./tools/update-lender-match-rule";
import deleteLenderMatchRule from "./tools/delete-lender-match-rule";
import createLenderPassDetection from "./tools/create-lender-pass-detection";
import updateLenderPassDetection from "./tools/update-lender-pass-detection";
import deleteLenderPassDetection from "./tools/delete-lender-pass-detection";
import createLenderPassPattern from "./tools/create-lender-pass-pattern";
import updateLenderPassPattern from "./tools/update-lender-pass-pattern";
import deleteLenderPassPattern from "./tools/delete-lender-pass-pattern";
import createLenderSyncRequest from "./tools/create-lender-sync-request";
import updateLenderSyncRequest from "./tools/update-lender-sync-request";
import deleteLenderSyncRequest from "./tools/delete-lender-sync-request";
import createLenderSyncRequestDecision from "./tools/create-lender-sync-request-decision";
import updateLenderSyncRequestDecision from "./tools/update-lender-sync-request-decision";
import deleteLenderSyncRequestDecision from "./tools/delete-lender-sync-request-decision";
import createLenderDuplicateDismissal from "./tools/create-lender-duplicate-dismissal";
import updateLenderDuplicateDismissal from "./tools/update-lender-duplicate-dismissal";
import deleteLenderDuplicateDismissal from "./tools/delete-lender-duplicate-dismissal";
import createLenderHistoryWarningDismissal from "./tools/create-lender-history-warning-dismissal";
import updateLenderHistoryWarningDismissal from "./tools/update-lender-history-warning-dismissal";
import deleteLenderHistoryWarningDismissal from "./tools/delete-lender-history-warning-dismissal";
import addLenderNote from "./tools/add-lender-note";
import updateLenderNote from "./tools/update-lender-note";
import deleteLenderNote from "./tools/delete-lender-note";
import updateLenderAttachment from "./tools/update-lender-attachment";
import deleteLender from "./tools/delete-lender";
import mergeLenders from "./tools/merge-lenders";
import updateClaapMeetingMatch from "./tools/update-claap-meeting-match";
import listLenderClaapMeetings from "./tools/list-lender-claap-meetings";
import listOutstandingItems from "./tools/list-outstanding-items";
import createOutstandingItem from "./tools/create-outstanding-item";
import updateOutstandingItem from "./tools/update-outstanding-item";
import batchCreateOutstandingItems from "./tools/batch-create-outstanding-items";

// The OAuth issuer MUST be the direct Supabase host (see cloud-auth-oauth-server).
// SUPABASE_URL on Lovable Cloud is a `.lovable.cloud` proxy; the token issuer is
// `https://<ref>.supabase.co/auth/v1`. VITE_SUPABASE_PROJECT_ID is inlined at
// build time so this stays import-safe (no runtime env read at module scope).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "naitive",
  title: "naitive",
  version: "0.1.0",
  instructions:
    "Tools for the naitive deal-management platform. Callers act as the signed-in naitive user; all reads and writes respect the user's company scoping and access. Use `list_deals`/`get_deal` to inspect deals — `list_deals` applies NO implicit pipeline/owner/stage filter and returns deals from every pipeline the caller can see, with `total_count`/`next_offset`/`has_more` for full pagination and a `pipeline_breakdown`; pair it with `list_pipelines` (all pipelines, their stages and deal counts) to confirm coverage across pipelines — `update_deal` to move stage or edit fields, `add_deal_status_note` to add or replace the status note on a deal (the Status Note box on the deal page), `list_tasks`/`create_task`/`complete_task` for task work, `search_contacts`/`search_companies`/`create_contact`/`create_company` for CRM lookups (both searches are paginated and accept fields=* for every column), `get_contact` for one contact's complete record plus linked company, deals, logged activities, field-level change history, AI field suggestions, attachments and funding-source/partner links, `get_company` for one CRM company's complete record plus its contacts, deals, full activity history, attachments, team, contact-match history, parent/child companies, linked funding sources and tasks, `search_lenders` (paginated directory search, fields=* returns every master_lenders column), `get_lender` (one funding source's complete record plus contacts, notes, attachments, change history and linked deals), `update_lender` (partial write to master_lenders columns — criteria, deal size, industries, geographies, referral terms and the LEGACY single contact_name/contact_title/contact_phone columns — audited per field), `upsert_lender_contact` (add or update one entry in the SEPARATE multi-contact `lender_contacts` list, with automatic single-primary enforcement; not interchangeable with `update_lender`), `create_lender` (add a NEW funding source; rejects duplicate names — use `update_lender` for existing ones), `delete_lender_contact` (remove a duplicate/wrong lender_contacts row, confirm required), `add_lender_attachment`/`list_lender_attachments`/`delete_lender_attachment` (funding-source documents such as NDAs, one-pagers and referral agreements) and `add_lender_to_deal` for the funding-source directory, `list_deal_funding_sources` to read the lenders attached to a specific deal (matches the deal's Funding Sources tab), and — for deep deal context — `search_deal_notes`, `get_deal_note` (read one note's full content), `add_deal_note_entry` (prepend/append an entry to a Deal Space note such as \"Q&A Notes\", creating it if missing, with idempotency_key dedupe — never overwrites), `list_deal_activity`, `search_deal_documents`, `get_deal_document`, `search_deal_emails`, and `search_deal_recordings` to retrieve notes, timeline events, files, email history, and meeting transcripts scoped to a specific deal. Daily rundown tools (`get_daily_rundown`, `add_daily_rundown_item`, `update_daily_rundown_item`, `complete_daily_rundown_item`, `reorder_daily_rundown_items`) manage the personal dashboard rundown — access is restricted to jturner@5thline.co and enforced at the database (RLS) and edge-function layers. Insights analytics tools give full read access to everything on the Insights page: `list_insights_dashboards` enumerates dashboards, saved widget layouts, and custom formula metrics; `get_pipeline_metrics` returns deal-pipeline aggregates (value, fees, counts) broken down by stage, status, type, manager, owner, pipeline, and month for any timeframe; `get_funnel_velocity` returns stage conversion and time-in-stage analytics; `get_revenue_metrics` returns QuickBooks invoiced revenue by month/customer/entity plus P&L snapshots; `get_lender_metrics` returns funding-source funnel analytics; `get_metric_targets` returns Master Plan targets and manual inputs for plan-vs-actual comparisons; and `query_insights_dataset` is a read-only, fully paginated escape hatch over every underlying dataset (including deal write-ups, memos, checklists, attachments, financials and ownership). Use `describe_schema` first to discover exact column names and allowed enum values, then `list_deals` with fields=* to extract complete deal records in bulk across all pipelines. `list_referral_partners` (read-only) returns the contacts in the Referral Source pipeline (Nurturing, Tier 3, Tier 2, Tier 1) with name, email, title, company, stage, stage-entered date, last updated and owner, plus per-stage counts and a missing-email count — use it to build email lists. `get_sales_calls_weekly` returns the weekly Sales Calls count (Debt or FinServ) shown on the Sales Dashboard. `get_deal_hours_fees` returns Hours & Fees per deal (retainer, milestone, success fee %, closing fee, total fee, pre/post-signing hours, revenue per hour, optional weekly logged hours) with per-pipeline and overall rollups. All of them apply the same global test-deal exclusions and RLS scoping as the UI. Open Items: `list_outstanding_items`, `create_outstanding_item`, `update_outstanding_item`, and `batch_create_outstanding_items` manage the Deal Space widget. Status inputs are requested (Requested, default), received (Received), submitted (Submitted); priorities normal (default), high, urgent. open_only means incomplete (not both received and submitted), unlike the item-type UI tab. lender_id is deal_lenders.id, not master_lenders.id. assigned_to is opaque text, currently unused in the widget. Writes require explicit user approval. Metadata idempotency keys cannot be changed; archived duplicates return existing rows. Append notes preserves history; no delete tool or email action. Use offset for listing pagination.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listDeals,
    listPipelines,
    getDeal,
    updateDeal,
    linkDealContact,
    unlinkDealContact,
    addDealAlias,
    removeDealAlias,
    addDealStatusNote,
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
    updateLender,
    upsertLenderContact,
    createLender,
    deleteLenderContact,
    addLenderAttachment,
    listLenderAttachments,
    deleteLenderAttachment,
    addLenderToDeal,
    updateDealLender,
    searchDealNotes,
    addDealNoteEntry,
    getDealNote,
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
    listReferralPartners,
    getSalesCallsWeekly,
    getDealHoursFees,
    getCashflowMetrics,
    createLenderFitAttribute,
    updateLenderFitAttribute,
    deleteLenderFitAttribute,
    createLenderDisqualification,
    updateLenderDisqualification,
    deleteLenderDisqualification,
    createLenderDocFlag,
    updateLenderDocFlag,
    deleteLenderDocFlag,
    createFundingSourceAcquisitionPlan,
    updateFundingSourceAcquisitionPlan,
    deleteFundingSourceAcquisitionPlan,
    createLenderMatchRule,
    updateLenderMatchRule,
    deleteLenderMatchRule,
    createLenderPassDetection,
    updateLenderPassDetection,
    deleteLenderPassDetection,
    createLenderPassPattern,
    updateLenderPassPattern,
    deleteLenderPassPattern,
    createLenderSyncRequest,
    updateLenderSyncRequest,
    deleteLenderSyncRequest,
    createLenderSyncRequestDecision,
    updateLenderSyncRequestDecision,
    deleteLenderSyncRequestDecision,
    createLenderDuplicateDismissal,
    updateLenderDuplicateDismissal,
    deleteLenderDuplicateDismissal,
    createLenderHistoryWarningDismissal,
    updateLenderHistoryWarningDismissal,
    deleteLenderHistoryWarningDismissal,
    addLenderNote,
    updateLenderNote,
    deleteLenderNote,
    updateLenderAttachment,
    deleteLender,
    mergeLenders,
    updateClaapMeetingMatch,
    listLenderClaapMeetings,
    listOutstandingItems,
    createOutstandingItem,
    updateOutstandingItem,
    batchCreateOutstandingItems,
  ],
});