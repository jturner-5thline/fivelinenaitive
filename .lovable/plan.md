# Prompt 6 — FIX Plan (PHASE 1, awaiting "approved")

Scope: 3 defects on the AI Assist "Update Lender …" surface. Strictly additive. No Prompt 1–5 artifact touched. No scheduler / calendar / draft / nudge / send-pipeline code touched. 5th Line tenant verification only.

---

## 1. Files touched vs new

### NEW (3 files)
- `src/lib/newsletterSenderDetection.ts` — pure helper. Exports `NEWSLETTER_DENY_DOMAINS`, `isNewsletterSender({ fromEmail, headers })`, `hasListUnsubscribe(headers)`. ~50 LOC.
- `src/lib/__tests__/newsletterSenderDetection.test.ts` — unit tests (matrix below).
- `supabase/migrations/<ts>_ai_action_log.sql` — new `ai_action_log` table + RLS (DDL below). Additive; touches no existing tables.

### TOUCHED (2 files, minimal additive diffs)
- `src/hooks/useThreadWorkflowAnalysis.ts` — after the existing 5th-Line internal-firm suppression block (lines ~321–355), append a second suppression block that nulls `likely_lender_firm` when:
  - sender domain ∈ `NEWSLETTER_DENY_DOMAINS`, OR
  - thread headers contain `List-Unsubscribe` / `List-Id` (read from `thread.latestEmail.headers` if present, otherwise no-op), OR
  - `result.likely_lender_firm.confidence === 'low'` AND no `recommended_update.lender_id`.
  Same shape as existing internal-firm block — sets `likely_lender_firm = { id:'', name:'', confidence:'low', reasoning:'newsletter_sender' | 'low_confidence' | 'list_unsubscribe_header' }` and downgrades `recommended_update.kind` to `'none'` if it was `lender_status`. No other field touched.
- `src/components/deal/email/EmailQuickActionsToolbar.tsx` — wrap the `lender` pill's `AIAssistActionButton` in a `Tooltip` when `!dealId && !fallbackDealId`, pass `disabled` + visual `aria-disabled` props, and add an inline `Info` icon. Click handler short-circuits to a `logRefusal('no_deal_match')` call (new helper in `src/lib/aiAssistRefusalLogger.ts` — listed as TOUCHED-adjacent NEW below) instead of opening the inline card. The existing "Link this email to a deal …" copy in `UpdateLenderStatusInlineCard` is left untouched (additive guidance preserved).

### NEW (logger helper, 1 file)
- `src/lib/aiAssistRefusalLogger.ts` — thin client wrapper around `supabase.from('ai_action_log').insert(...)`. Resolves `actor_user_id` from auth, `company_id` from active company context. ~30 LOC. Exports `logUpdateLenderRefused({ reason, threadId, contactId })`.

Total: 4 new files, 2 touched files. No edge functions. No changes to settings tables, ff_ai_settings_mutations, SettingsMutationCard, useSettingsMutation, AICopilotPanel, ChatMessageList, ai-settings-tool, ai-settings-apply, settings_audit_log, MeetingScheduler*, calendar-events, send-pipeline, or email ingestion classifier outside the additive `likely_lender_firm` suppression block.

---

## 2. NEWSLETTER_DENY_DOMAINS constant

Location: `src/lib/newsletterSenderDetection.ts`

```ts
export const NEWSLETTER_DENY_DOMAINS: ReadonlySet<string> = new Set([
  'substack.com',
  'mailchimp.com',
  'beehiiv.com',
  'convertkit.com',
  'ghost.io',
  'medium.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'youtube.com',
  'googlegroups.com',
  'mailgun.org',
  'sendgrid.net',
]);
```

Helpers:
- `isNewsletterSender(fromEmail)` — extracts domain via existing `domainOf()` from `src/lib/internalDomains.ts` pattern, returns `true` if in set.
- `hasListUnsubscribe(headers)` — case-insensitive lookup for `list-unsubscribe` or `list-id` keys in the optional headers map; returns `false` if headers absent.

Reused by `useThreadWorkflowAnalysis.ts` only. Not exported elsewhere.

---

## 3. DDL — `ai_action_log` (new table, additive)

```sql
-- New table only. No ALTER on existing tables. Zero existing rows mutated.
CREATE TABLE public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,                      -- e.g. 'update_lender_refused'
  reason text NOT NULL,                      -- 'no_deal_match' | 'low_confidence' | 'newsletter_sender'
  thread_id text,
  contact_id uuid,
  actor_user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_action_log_company_created
  ON public.ai_action_log (company_id, created_at DESC);
CREATE INDEX idx_ai_action_log_action_reason
  ON public.ai_action_log (action, reason);

ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT (uses existing has_role pattern from user_roles).
CREATE POLICY "ai_action_log_admin_select"
  ON public.ai_action_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated insert restricted to own user + own company (client writes
-- happen under the user's JWT; service role bypasses RLS as usual).
CREATE POLICY "ai_action_log_self_insert"
  ON public.ai_action_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );
```

No UPDATE / DELETE policies → append-only. No triggers attached to reserved schemas. Verified `has_role` + `profiles.company_id` exist in current schema before submitting migration.

---

## 4. Disabled-button JSX snippet

In `EmailQuickActionsToolbar.tsx`, around the `actions.map((a) => …)` block, special-case `a.key === 'lender'`:

```tsx
if (a.key === 'lender') {
  const hasDeal = !!(dealId || fallbackDealId);
  const btn = (
    <AIAssistActionButton
      key={a.key}
      label={a.label}
      icon={
        <span className="inline-flex items-center gap-1">
          {a.icon}
          {!hasDeal && <Info className="h-3 w-3 opacity-60" aria-hidden />}
        </span>
      }
      iconClass={a.iconClass}
      isActive={isActive}
      aria-disabled={!hasDeal}
      className={cn(!hasDeal && 'opacity-50 cursor-not-allowed')}
      onClick={() => {
        if (!hasDeal) {
          void logUpdateLenderRefused({
            reason: 'no_deal_match',
            threadId: thread.threadId,
            contactId: contactId ?? null,
          });
          return;
        }
        handleClick(a.key);
      }}
    />
  );
  return hasDeal ? btn : (
    <Tooltip key={a.key}>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="top">Link a deal first to update lender stage</TooltipContent>
    </Tooltip>
  );
}
```

`UpdateLenderStatusInlineCard`'s existing "Link this email to a deal…" copy is left fully intact — the disabled button is an additive guardrail, not a replacement.

---

## 5. Unit test matrix (`newsletterSenderDetection.test.ts`)

| # | Case | Input | Expected |
|---|------|-------|----------|
| 1 | substack.com sender | `samfjacobs@substack.com` | `isNewsletterSender == true` |
| 2 | linkedin.com sender | `noreply@linkedin.com` | `isNewsletterSender == true` |
| 3 | legitimate lender domain | `vp@founders-first.com` | `isNewsletterSender == false` |
| 4 | subdomain of substack | `bounce@email.substack.com` | `isNewsletterSender == true` (subdomain trim) |
| 5 | empty / missing | `undefined`, `''`, `'no-at'` | `false` (no throw) |
| 6 | List-Unsubscribe header lowercase | `{ 'list-unsubscribe': '<mailto:…>' }` | `hasListUnsubscribe == true` |
| 7 | List-ID header mixed case | `{ 'List-Id': '<…>' }` | `hasListUnsubscribe == true` |
| 8 | no headers | `undefined` | `hasListUnsubscribe == false` |

No tests added for `useThreadWorkflowAnalysis` (existing hook has no test file; additive suppression block is mechanically identical to the internal-firm block already there). No tests added for the React toolbar change (visual-only) — verified via live step §6.

---

## 6. Live verification steps (5th Line tenant, jturner@5thline.co)

Pre-state SQL:
```sql
SELECT count(*) FROM public.ai_action_log
WHERE company_id = '<5thline company_id>' AND action = 'update_lender_refused';
```

### V1 — Defect 1 (classifier)
1. Navigate `/sales-bd` → open thread "Sundays with Sam #20: Non-Public Material".
2. Wait for AI Assist sidebar to finish loading.
3. **PASS bar**: the `Lender: Substack` chip in the Deal/Contact/Lender chip row is **absent**. The Lender pill on the toolbar is in the disabled state (because no deal is linked). Screenshot the chip row + the disabled pill.

### V2 — Defect 2 (UX affordance)
1. Same thread (no deal linked).
2. Hover the "Update Lender Stage" pill.
3. **PASS bar**: tooltip reads exactly "Link a deal first to update lender stage". Inline ⓘ icon visible. Cursor is `not-allowed`. Pill does not expand the inline card. Screenshot tooltip.
4. Open any thread that IS linked to a deal (e.g. an existing PFG / Founders First thread) — confirm the pill is fully active (no tooltip, no ⓘ, click expands the inline card normally). Screenshot.

### V3 — Defect 3 (telemetry)
1. From step V2.2, click the disabled pill once.
2. Run:
```sql
SELECT id, action, reason, thread_id, actor_user_id, company_id, created_at
FROM public.ai_action_log
WHERE company_id = '<5thline company_id>'
ORDER BY created_at DESC
LIMIT 3;
```
3. **PASS bar**: exactly one new row with `action='update_lender_refused'`, `reason='no_deal_match'` (or `'newsletter_sender'` if the Substack thread short-circuits there first), `thread_id` matches the Sundays-with-Sam thread, `actor_user_id` = jturner profile UUID, `company_id` = 5th Line UUID. Screenshot the SQL result.

### V4 — Non-regression smokes (lightweight, no mutations)
- Open a real lender thread on a linked deal → confirm `Lender: <name>` chip still appears AND the toolbar pill is fully active. Screenshot.
- Open Settings → AI Settings → confirm SettingsMutationCard renders unchanged (Prompt 1–5 surface untouched). Screenshot.
- `SELECT count(*) FROM public.settings_audit_log;` before vs after entire verification → must be unchanged (=0 delta).

---

## 7. Hard guarantees
- No migrations modify or drop any existing column/table.
- No rows in any existing table mutated by the verification run (only INSERTs into the brand-new `ai_action_log`).
- Frozen surfaces (SettingsMutationCard, useSettingsMutation, AICopilotPanel, ChatMessageList, ai-settings-tool, ai-settings-apply, settings_audit_log, ff_ai_settings_mutations, Schedule Meeting / NOTES / Draft Reply / Stale Status Nudge / Availability Check / calendar render / meeting-holds / calendar-events / send-pipeline / non-lender ingestion classifier / create_calendar / GCAL_SMOKETEST_CALENDAR_ID) — not opened, not edited, not imported by any new file.
- Feature flag: none introduced; behavior is universally safer than current (refuses junk lender pills, prevents click-then-refuse).

---

STOP. Awaiting **approved** before writing any code or running the migration.
