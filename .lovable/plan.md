# Contact ↔ Company Domain Sync

## Summary
Generalize the existing Blount-only auto-link trigger into a platform-wide, per-org contact-to-company sync driven by normalized email/website domains, with freemail exclusions, an ignore list, a review queue, and a bulk resync action.

## What already exists (reuse, don't rebuild)
- `contacts.email_domain_normalized` + trigger `tg_contacts_set_email_domain_normalized` (uses `normalize_email_domain`)
- `crm_companies.domain_normalized` + trigger `tg_crm_companies_set_domain_normalized` (uses `normalize_website_domain`, prefers `website_url` then `domain`)
- Index `idx_crm_companies_domain_normalized (org_company_id, domain_normalized)`
- `crm_company_id` FK on contacts
- Blount-only triggers `tg_blount_company_autolink_contacts` and `trg_blount_contact_autolink` — to be replaced by an org-agnostic version

## Schema changes (one migration)

### `contacts` (new columns)
- `match_status` enum-as-text: `unmatched | matched | needs_review | ignored` (default `unmatched`)
- `match_confidence` numeric(3,2) — 1.00 root-domain, 0.80 subdomain, 0.50 ambiguous, 0.00 freemail/no match
- `match_source` text — `auto_trigger | bulk_resync | manual_override | suggestion_accepted`
- `last_match_run_at` timestamptz

### `crm_companies`
- No structural change. `website_domain_normalized` requested in spec is already covered by `domain_normalized`; add a view-only computed alias if helpful but no new column.

### New `contact_company_match_audit`
```
id, org_company_id, contact_id, proposed_company_id (nullable),
raw_contact_email, raw_company_website, normalized_contact_domain,
normalized_company_domain, decision (auto_matched|suggested|ignored|rejected|no_match),
reason text, created_at, created_by (nullable)
```
RLS scoped by `org_company_id` via `is_member_of_company`. GRANT to authenticated + service_role.

### New `domain_match_settings` (per org, 1 row)
```
org_company_id PK, auto_apply boolean default true,
subdomain_matching boolean default false,
ignored_domains text[] default '{}',
extra_freemail_domains text[] default '{}',
updated_at
```
RLS: company members read; admins write.

### Freemail list
Single source of truth: a SQL-side `IMMUTABLE` function `public.is_freemail_domain(text)` returning true for gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, aol.com, proton.me, protonmail.com, live.com, msn.com, gmx.com, mail.com, yandex.com, zoho.com, fastmail.com, hey.com, me.com, mac.com, ymail.com, rocketmail.com, comcast.net, verizon.net, att.net, sbcglobal.net. Mirror as a TS constant in `src/lib/freemailDomains.ts`.

## Matching logic (DB function)

New `public.run_contact_company_match(p_contact_id uuid) returns jsonb`:
1. Load contact email + normalized domain + org_company_id + existing crm_company_id.
2. If `crm_company_id IS NOT NULL` — return no-op (preserve existing link).
3. If domain is null, freemail, in `ignored_domains`, or in `extra_freemail_domains` → mark `match_status='ignored'`, write audit row, return.
4. Find candidates in `crm_companies` for the same `org_company_id` where:
   - exact: `domain_normalized = contact_domain` (confidence 1.00), OR
   - subdomain (only if `subdomain_matching=true`): contact_domain ends with `.' || domain_normalized` (confidence 0.80).
5. Decide:
   - 1 exact + `auto_apply` → set `crm_company_id`, `match_status='matched'`, confidence 1.00, source `auto_trigger`; audit `auto_matched`.
   - 1 exact + `auto_apply=false` → status `needs_review`; audit `suggested`.
   - >1 candidates → status `needs_review`, store no FK; audit one row per candidate with `decision='suggested'`.
   - 0 → status `unmatched`; audit `no_match`.
6. Always update `last_match_run_at`.

## Triggers (replace Blount-specific ones)

- Drop `trg_blount_contact_autolink` and `trg_blount_company_autolink`.
- `trg_contacts_autolink_after_change` AFTER INSERT OR UPDATE OF email, email_domain_normalized, crm_company_id ON contacts → calls `run_contact_company_match(NEW.id)` when email_domain_normalized changed and crm_company_id is null.
- `trg_companies_autolink_unmatched` AFTER INSERT OR UPDATE OF domain_normalized ON crm_companies → re-runs match for all unmatched contacts in the same org whose `email_domain_normalized` equals the new value (uses the same function, batched in a CTE).

Both triggers no-op when `auto_apply=false` (only write audit rows / set `needs_review`).

## Edge function: `contact-company-sync`
Auth: `supabase.auth.getUser()` mandatory, 401 on miss; user-scoped client; verify caller `is_member_of_company(target_org)`.

Modes:
- `mode=single, contact_id`
- `mode=bulk_org` — iterates all contacts in caller's org (batched 500/loop)
- `mode=bulk_company, company_id` — re-matches all contacts whose email domain equals that company's domain_normalized
- `mode=resync_contact, contact_id, force=true` — clears `crm_company_id` first when force

Returns `{ matched, suggested, ignored, unmatched, processed }`.

## Frontend

### Shared util `src/lib/domainMatch.ts`
- `normalizeEmailDomain(email)`, `normalizeWebsiteDomain(url)`, `isFreemailDomain(domain)`, `extractRootDomain(domain)`. Mirrors the SQL logic for client-side previews.

### Review queue page `src/pages/admin/ContactCompanySync.tsx` (route `/admin/contact-company-sync`)
- Header: "Run sync" button (calls edge fn `bulk_org`) with toast progress.
- Tabs: All / Matched / Needs review / Unmatched / Ignored — driven by `contacts.match_status` filter.
- Table per contact: email, extracted domain, current company, suggested company(ies) from audit table, reason, confidence.
- Row actions: Confirm (apply suggestion), Reject, Reassign (opens company picker), Mark ignored.
- Settings drawer: auto_apply toggle, subdomain matching toggle, ignored domains chips, extra freemail chips.

### Hook `src/hooks/useContactCompanySync.ts`
- `useDomainMatchSettings()` / `useUpdateDomainMatchSettings()`
- `useMatchSuggestions(filter)` — joins `contact_company_match_audit` with contacts + companies, scoped by org
- `useRunSync({ mode, ... })` invokes edge fn
- `useResolveSuggestion({ contactId, companyId|null, decision })` — updates contact + writes audit row

### Surface hooks
- Add "Re-sync company" item to existing contact detail action menu (`src/pages/ContactDetail.tsx`) calling `mode=resync_contact, force=true`.
- Add a small badge in contact rows when `match_status='needs_review'` linking to the review queue.

## Backfill (in the same migration, after triggers)
- Recompute `email_domain_normalized` and `domain_normalized` for all rows (touch via update where null).
- For each contact with null `crm_company_id` and non-freemail non-ignored domain:
  - exact-match single → set company, `match_status='matched'`, audit `auto_matched`.
  - exact-match multi → `match_status='needs_review'`, audit per candidate.
  - else → `match_status='unmatched'`.
- Existing linked contacts are left alone (preserve relationship).

## Acceptance
- New trigger runs on every contact insert/update across all orgs (no hardcoded org id).
- Freemail addresses never auto-link.
- Multi-candidate domains queue for review.
- Pre-existing `crm_company_id` is never overwritten without explicit resync.
- Bulk run reports counts and is idempotent.
- All decisions are auditable via `contact_company_match_audit`.

## Technical notes
- All SQL functions use `SECURITY DEFINER SET search_path = public` only where they need to bypass RLS to write audit rows. The match function is `STABLE` for reads; mutation lives in a wrapper.
- Edge function invokes `run_contact_company_match` via `supabase.rpc` per id (batched in transactions of 500).
- No `count: 'exact'` queries on the review tables — paginated with `count: 'planned'`.
- Memory rule respected: roles via `user_roles`/`has_role`; settings page gated to company admins.
