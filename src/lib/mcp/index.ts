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
    "Tools for the naitive deal-management platform. Callers act as the signed-in naitive user; all reads and writes respect the user's company scoping and access. Use `list_deals`/`get_deal` to inspect deals, `update_deal` to move stage or edit fields, `list_tasks`/`create_task`/`complete_task` for task work, `search_contacts`/`search_companies`/`create_contact`/`create_company` for CRM lookups, and `search_lenders`/`add_lender_to_deal` to work with the funding-source directory.",
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
  ],
});