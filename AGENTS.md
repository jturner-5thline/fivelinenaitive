- FLEx integration is permanently disconnected: FLEx edge functions are inert stubs and DB sync triggers are dropped — never re-add outbound/inbound FLEx calls (user decision).

- KB export: `kb-export-pull` (x-export-key auth, verify_jwt=false) calls three service_role-only RPCs `fn_kb_export_*` with the tenant hardcoded in SQL — why: the tenant must never be caller-controlled and no browser/user role may read the export.
- Distressed Debt pipeline (5th Line only, deal_class='distressed') is fully isolated: UI uses allowedMoveTargets() and a DB trigger blocks pipeline_id moves in/out — why: user requires deals never switch into or out of it.

- Deal Activity calendar reads use the authenticated deal-team-calendar-events endpoint scoped to verified deal-company membership, not the caller-only mirror or email-domain grouping — why: all connected teammates must contribute without cross-tenant access.
- Calendar provider reads have one bounded deadline per owner and settle independently with explicit partial-data warnings — why: a slow owner must not discard other calendars or exceed the request idle limit.
- Referral Source tiers count only referred deals with a recorded Active (default) pipeline stage entry, dated by NDA / Needs List Sent entry or else the closest later stage entry, never created_at (src/lib/referralNdaEntry.ts) — why: import timestamps and pre-NDA leads inflated tiers.
- Referral Source pipeline classification for MCP lives in `src/lib/mcp/referralPipeline.ts` and mirrors `useDealReferralSources` + `ReferralSourcePipelineWidget` — why: the connector must report the same stages as the UI, so change both together.
- Funding-source imports reconcile legacy primary fields and child contacts through `syncImportedLenderContacts` and the company-scoped CRM resolver — why: both CSV import paths must create or reuse Contacts records and report partial linking failures without deleting imported data.
- The merged Tasks panel reuses OutstandingItems for management and item details; completion updates Received and Submitted together — why: preserve bulk/checklist editing and persist the actual stored status fields without duplicating editor logic.

- Public homepage uses isolated `homepage-os` semantic tokens and a shared BookDemoDialog for every demo CTA; why: marketing updates must not restyle authenticated screens or diverge in request handling.
- Public and workspace header wordmarks use the shared Logo component with a CDN asset pointer; why: logo replacements stay consistent across header locations without duplicating images.

- Assignment-email exclusions use the shared taskAssignmentEmailPolicy at both managed and legacy send boundaries; why: every assignment path must enforce the same policy without changing tasks or in-app notifications.

- Team invitations use the transactional `accept_company_invitation` RPC to validate the token, verified recipient, approved same-company inviter, availability, and revocations before committing membership and approval; why: invitations must not leave partial memberships or turn self-signups and revoked users into approved accounts. Approval queries throw on failures, and both access screens show retry without granting access.
