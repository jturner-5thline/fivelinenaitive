# Read-after-Write Verification for Deal Updates

## Goal

Every backend write to `public.deals` performs `.update(patch).eq('id', dealId).select(<written cols>).maybeSingle()`, then compares each written field against the returned row. Mismatches raise a structured `WriteNotPersistedError` that the copilot ask bar surfaces verbatim ("I tried to set X to A but the database still has B") instead of a generic "Done."

No UI changes in this pass — only handler logic, a shared helper, and the error type. UI surfacing of the new error format in the copilot is wired up in `copilot-chat` only (the ask bar already renders text from that function).

## Scope

In-scope edge functions (write to `deals`):

```
deal-operations          copilot-chat              claap-webhook
agent-orchestrator       agent-chat                claap-suggest-matches
execute-agent-graph      execute-workflow          claap-backfill
wf-stage-trigger         weekly-hours-api          dashboard-chat
hubspot-sync             hubspot-create-deal       hubspot-deal-stage-push
smart-email-ai           deal-space-ai             slack-agent-gateway
send-flex-reply          process-scheduled-actions process-followup-scheduled
process-recurring-tasks  daily-crm-update-scan     classify-file
compute-financial-metrics recommend-lenders        seed-sample-deal
seed-demo-account        execute-agent-trigger     generate-scheduled-report
send-ux-insights-email   create-demo-access
```

Frontend hooks (`src/hooks/use*`) that call `.update()` directly on `deals` are **out of scope for this pass** — they show toasts client-side already and don't route through the ask bar. They will be addressed in a follow-up if the user wants.

## Design

### 1. Shared helper (new file)

`supabase/functions/_shared/verifiedDealUpdate.ts`

```ts
export class WriteNotPersistedError extends Error {
  code = 'WRITE_NOT_PERSISTED' as const;
  constructor(
    public dealId: string,
    public mismatches: Array<{ field: string; expected: unknown; actual: unknown }>,
  ) {
    super(
      `Deal ${dealId} did not persist ${mismatches.length} field(s): ` +
      mismatches.map(m => `${m.field} expected ${JSON.stringify(m.expected)} got ${JSON.stringify(m.actual)}`).join('; ')
    );
    this.name = 'WriteNotPersistedError';
  }
}

export async function verifiedDealUpdate(
  client: SupabaseClient,
  dealId: string,
  patch: Record<string, unknown>,
  opts?: { skipVerifyFields?: string[] }
): Promise<Row> { /* ... */ }
```

Behavior:
- Builds `selectCols` = union of `Object.keys(patch)` + `['id', 'updated_at']`, minus any caller-specified `skipVerifyFields`.
- Runs `.update(patch).eq('id', dealId).select(selectCols.join(',')).maybeSingle()`.
- Throws if `error` or if row is `null` (row not found / RLS blocked) — both become `WriteNotPersistedError` with `mismatches: [{field: '__row__', expected: 'present', actual: 'null'}]`.
- For each key in `patch`, normalizes both sides before compare:
  - Dates (`closing_date`, `projected_close_date`, `contract_*_date`, `next_step_date`, `notes_updated_at`) → ISO date prefix `YYYY-MM-DD`.
  - Numerics → `Number()` with `Number.EPSILON` tolerance.
  - Arrays → sorted shallow compare.
  - Strings → trim.
  - JSONB → `JSON.stringify` of canonicalized object.
- Collects mismatches into one `WriteNotPersistedError` (don't throw on the first — surface all so the AI can report them together).

### 2. Skip-verify list (necessary to avoid false positives)

The helper auto-skips these even if present in `patch`:
- Generated columns: `total_fee`
- Trigger-managed: `updated_at` (we always pass `now()` but trigger may overwrite)
- Server-defaulted fields when caller passed `undefined`/`null` intentionally

Caller may pass extras via `opts.skipVerifyFields`.

### 3. Edge function changes (pattern)

Replace every:
```ts
const { error } = await supabase.from('deals').update(patch).eq('id', dealId);
if (error) throw error;
```

with:

```ts
import { verifiedDealUpdate, WriteNotPersistedError } from '../_shared/verifiedDealUpdate.ts';
const updated = await verifiedDealUpdate(supabase, dealId, patch);
```

And wrap the existing top-level try/catch so `WriteNotPersistedError` is serialized:

```ts
catch (err) {
  if (err instanceof WriteNotPersistedError) {
    return new Response(JSON.stringify({
      ok: false,
      error_code: 'WRITE_NOT_PERSISTED',
      message: err.message,
      mismatches: err.mismatches,
      deal_id: err.dealId,
    }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  // existing fallthrough
}
```

### 4. Copilot ask-bar wiring (`supabase/functions/copilot-chat/index.ts`)

When the copilot calls a tool that performs a deal write and the response contains `error_code === 'WRITE_NOT_PERSISTED'`, prepend a system-level note to the model turn:

> Tool reported the write did not persist. Tell the user verbatim: "I tried to set {field} to {expected} but the database still has {actual}." Do not say "Done." Do not retry silently.

The streamed model output is what the ask bar already renders — no UI code change.

### 5. Tests

Add `supabase/functions/_shared/verifiedDealUpdate_test.ts` covering:
- Happy path: returned row equals patch.
- Mismatch on one field → throws with one entry.
- Mismatch on multiple fields → throws with all entries.
- Date normalization (string vs `Date` vs ISO).
- Numeric tolerance.
- RLS / row-not-found → throws with `__row__` mismatch.
- Skip-list fields excluded from compare.

## Caveats the user should know

1. **False positives are the real risk.** DB triggers normalize values (e.g. `manager` may be trimmed, `closing_date` parsed via `to_date`, `stage` may be lower-cased by a trigger). The normalization layer in §2 covers the common ones, but each function we touch needs a spot-check that its patch doesn't include a field a trigger rewrites. If it does, that field goes in `skipVerifyFields`.

2. **Generated/computed fields** (`total_fee`) can never be verified — auto-skipped.

3. **RLS silent denials** are now loud — this is the *point*, but it means handlers that previously "succeeded" silently on permission failure will start returning 409s. We should grep for any function relying on that behavior (e.g., best-effort writes inside loops) and add explicit `skipVerifyFields: ['*']` opt-out or stop calling the helper for those.

4. **`hubspot-sync` writes thousands of rows in a batch** — wrapping each in a read-after-write doubles the round trips and may push it past timeout. Recommend keeping `hubspot-sync` and `claap-backfill` on the *unverified* path (they have their own reconciliation). Confirm before excluding them.

## Out of scope

- Frontend `src/hooks/*` direct `.update()` calls on `deals`.
- Writes to other tables (`tasks`, `claap_*`, etc.).
- Retrying on mismatch (the user asked for surfacing, not retry).
- UI changes in the ask bar component (the new message comes through naturally as model output).

## Open questions before I start

- Confirm `hubspot-sync` and `claap-backfill` are excluded (batch writers).
- Confirm 409 status code is acceptable (vs 200 with `ok: false`).
- For tools the copilot calls *speculatively* (e.g. `set_hours` with an unchanged value), should an unchanged-value write also be verified? (Current plan: yes, because the contract is "the DB now equals what we sent.")
