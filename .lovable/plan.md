## Fix: Edit Referral Source pre-population

### Root cause
`referral_sources` has rows with `company_id = NULL` (legacy inserts). `ReferralSourceEditDialog` filters strictly by `company_id = company.id`, so existing rows are never found and the dialog renders empty. New inserts via `useReferralSources.addReferralSource` also omit `company_id`, perpetuating the bug.

### Changes

1. **`src/components/channels/ReferralSourceEditDialog.tsx`**
   - Replace the `.eq('company_id', company.id).ilike('name', referredBy).maybeSingle()` lookup with a query that matches the workspace OR legacy NULL rows for the same `referredBy`:
     - Select `id, name, company, channel, company_id`
     - Use `.or('company_id.eq.<id>,company_id.is.null')`
     - Escape `%`/`_` in `referredBy` before `.ilike`
     - `.order('company_id', { nullsFirst: false })` then `.limit(1)` → take the first row (prefer scoped over NULL).
   - On save, if `recordId` exists and original `company_id` was NULL, include `company_id: company.id` in the UPDATE to backfill.

2. **`src/hooks/useReferralSources.ts`**
   - Pull `company` from `useCompany`.
   - In `addReferralSource`, include `company_id: company.id` on INSERT so new rows are workspace-scoped and findable by the edit dialog.
   - Leave the list query as-is (still `user_id`-scoped) to avoid changing visibility semantics in this fix.

3. **One-time data backfill (insert tool)**
   - `UPDATE referral_sources SET company_id = cm.company_id FROM company_members cm WHERE referral_sources.user_id = cm.user_id AND referral_sources.company_id IS NULL;`
   - This makes the existing 14 NULL rows immediately editable through the new scoped query path.

### Out of scope
- No schema changes, no RLS edits.
- Not changing `useReferralSources` list filter from user → company (separate decision).
- Deal-page Referral Source contact picker is unaffected (already works).
