import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { COMPANY_EDIT_FIELDS, editControls, runCrmUpdate } from "../crmRecordEdits";

export default defineTool({
  name: "update_company",
  title: "Update CRM company",
  description: "Partial update of a CRM company (crm_companies) by id. Only supplied fields change; null clears. Editable: name, domain, additional_domains, website_url, company_type, status, owner_user_id, industry, sub_industry, employee_count/range, annual_revenue, revenue_band, HQ address fields, regions_served, parent_company_id (same workspace), customer_tier, segment, lifecycle_stage, description and notes (mode replace/append/prepend), linkedin/twitter, phone, main_contact_email, tags, year_founded, financing_status, key_products. Supports dry_run and expected_updated_at. Every changed field is audited with source/change_reason; returns the full updated record and a diff.",
  inputSchema: { company_id: z.string().uuid(), ...COMPANY_EDIT_FIELDS, ...editControls },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (input, ctx) => runCrmUpdate("crm_companies", input.company_id, input, ctx),
});
