import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDeals from "./tools/list-deals";
import getDeal from "./tools/get-deal";
import updateDeal from "./tools/update-deal";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";
import completeTask from "./tools/complete-task";
import searchContacts from "./tools/search-contacts";
import searchCompanies from "./tools/search-companies";
import createContact from "./tools/create-contact";
import createCompany from "./tools/create-company";
import searchLenders from "./tools/search-lenders";
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
    "Tools for the naitive deal-management platform. Callers act as the signed-in naitive user; all reads and writes respect the user's company scoping and access. Use `list_deals`/`get_deal` to inspect deals, `update_deal` to move stage or edit fields, `list_tasks`/`create_task`/`complete_task` for task work, `search_contacts`/`search_companies`/`create_contact`/`create_company` for CRM lookups, `search_lenders`/`add_lender_to_deal` for the funding-source directory, `list_deal_funding_sources` to read the lenders attached to a specific deal (matches the deal's Funding Sources tab), and — for deep deal context — `search_deal_notes`, `list_deal_activity`, `search_deal_documents`, `get_deal_document`, `search_deal_emails`, and `search_deal_recordings` to retrieve notes, timeline events, files, email history, and meeting transcripts scoped to a specific deal. Daily rundown tools (`get_daily_rundown`, `add_daily_rundown_item`, `update_daily_rundown_item`, `complete_daily_rundown_item`, `reorder_daily_rundown_items`) manage the personal dashboard rundown — access is restricted to jturner@5thline.co and enforced at the database (RLS) and edge-function layers.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listDeals,
    getDeal,
    updateDeal,
    listTasks,
    createTask,
    completeTask,
    searchContacts,
    searchCompanies,
    createContact,
    createCompany,
    searchLenders,
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
  ],
});