import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { CONTACT_EDIT_FIELDS, editControls, runCrmUpdate } from "../crmRecordEdits";

export default defineTool({
  name: "update_contact",
  title: "Update CRM contact",
  description: "Partial update of a CRM contact (contacts) by id. Only supplied fields change; null clears. Editable: first/last name, email, additional_emails, phone_work/phone_mobile/phone_other, job_title, contact_type, lifecycle_stage, status, lead_source, owner_user_id, linkedin_url, city/state/country, description (mode replace/append/prepend), tags, crm_company_id (same workspace only), referral_agreement_on_file, w9_on_file, referral_fee, lender_referred_pct. Supports dry_run and expected_updated_at. Every changed field is audited with source/change_reason; returns the full updated record and a diff. Use list_field_options for allowed contact_type/lifecycle_stage/status values.",
  inputSchema: { contact_id: z.string().uuid(), ...CONTACT_EDIT_FIELDS, ...editControls },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (input, ctx) => runCrmUpdate("contacts", input.contact_id, input, ctx),
});
