## Plan: Add contacts to the Deal Info "Referral Source" dropdown

### Findings

**Where the field renders on the Deal Info form**
- `src/pages/DealDetail.tsx` lines 3802–3816 (case `'referralSource'`) — renders `<ReferralSourceContactInput />`. It writes the picked contact id to `deal.referralSourceContactId` and reads `deal.referredBy?.name` for display.

**Current contact-backed picker**
- `src/components/ui/referral-source-contact-input.tsx` — already queries `contacts` filtered by `org_company_id = company.id`, but:
  - Only searches `full_name ILIKE %q%` (misses first/last/email matches).
  - Has no "use as custom referral source (no contact)" path — picking always requires a contact id.
  - Does not surface the workspace's existing free-text `referral_sources` records (the ones managed by `useReferralSources` / `ReferralSourceEditDialog`).

**Free-text/custom referral source path (today)**
- Table: `public.referral_sources` (columns include `id, name, email, company, channel, user_id, company_id`).
- Hook: `src/hooks/useReferralSources.ts` — lists rows for the current user, adds new entries (now scoped to `company_id`).
- Legacy text picker: `src/components/ui/referral-source-input.tsx` (uses `useReferralSources`). Not currently mounted on DealDetail.
- Persistence on a deal for free-text: `deal.referredBy.name` / `deal.referredBy.email` (text fields), separate from `deal.referralSourceContactId`.

**Contacts source**
- Table: `public.contacts` (multi-tenant via `org_company_id`).
- Columns used for display: `first_name, last_name, full_name, email`.
- No dedicated combined hook — `ReferralSourceContactInput` queries `contacts` directly.

### Proposed change

Make `ReferralSourceContactInput` a unified picker that lists BOTH:
1. **Contacts** from `contacts` (preferred; selecting one stores a contact id).
2. **Existing free-text referral sources** from `referral_sources` (selecting one stores name/email only, leaves contact id null).
3. **Inline create** options remain: "Create contact \"X\"" and "Use \"X\" as referral source" (creates a `referral_sources` row, no contact).

### Implementation

1. **`src/components/ui/referral-source-contact-input.tsx`**
   - Broaden the contacts query: change `ilike('full_name', ...)` to `.or('full_name.ilike.%q%,first_name.ilike.%q%,last_name.ilike.%q%,email.ilike.%q%')` with `%`/`_` escaped.
   - In parallel, query `referral_sources` for the workspace: `select id, name, email, company`, filter `company_id = company.id OR is null`, `ilike` on `name`/`email`, limit 10.
   - Merge results into one dropdown with two section headers: "Contacts" and "Referral sources".
   - Extend the `onChange` payload to include a `kind: 'contact' | 'referral_source'` discriminator plus optional `email`. Keep backward-compatible single-arg signature.
   - Keep keyboard nav (`ArrowUp`/`Down`/`Enter`) working across the combined list.
   - Show "Create contact \"X\"" as today, plus a second action "Use \"X\" as referral source" that calls `useReferralSources.addReferralSource(trimmed)` and returns a `referral_source` selection.

2. **`src/pages/DealDetail.tsx` (case `'referralSource'`)**
   - Update `onChange` to handle both kinds:
     - `kind === 'contact'` → `updateDeal('referralSourceContactId', c.id)` and clear `referredBy` text fields (or set them from contact for display fallback).
     - `kind === 'referral_source'` → `updateDeal('referralSourceContactId', null)` and `updateDeal('referredBy', { name, email })` so the existing free-text path stays populated.
   - Display logic: prefer contact name when `referralSourceContactId` is set, otherwise `referredBy.name`.

3. **`src/hooks/useReferralSources.ts`** — no functional change required; reuse `addReferralSource` for the inline "Use as referral source" action.

### Out of scope
- No schema changes; no migration.
- No changes to `CreateDealDialog` / `DealEditDrawer` / `FinServCreateDealDialog` referral inputs (separate forms; can be aligned in a follow-up if you want).
- No change to how downstream analytics (`useDealReferralSources`, channels views) read `referredBy` / `referralSourceContactId`.

### Files to edit
- `src/components/ui/referral-source-contact-input.tsx`
- `src/pages/DealDetail.tsx` (only the `'referralSource'` case)

### Open question
Do you want the same unified picker rolled into `CreateDealDialog`, `DealEditDrawer`, and `FinServCreateDealDialog` in this pass, or keep this PR scoped to the Deal Info form only?
