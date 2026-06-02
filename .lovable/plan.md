# @-mention Tagging in Task Comments — Dry Run

## What already exists (reuse, don't rebuild)

- **`task_mentions` table** (with RLS, indexes, unread-count + realtime). Populated by `useCreateMentions()` in `src/hooks/useTaskMentions.ts`.
- **Mention parser**: `extractMentions(text)` and `renderMentionText(text)` in the same file handle `@[Name](user_id)` markup.
- **Composer primitive**: `src/components/ui/mention-textarea.tsx` + `mention-list.tsx` (Tiptap-based, arrow keys / Enter / Esc, avatar + email rows).
- **TaskDetailDrawer** (surface a) already uses `MentionTextarea` for the composer but does NOT call `useCreateMentions` after insert. Other 3 surfaces use plain `<textarea>`.

## What we still need

### 1. Migration — add denormalized `mentions` + trigger + RLS tightening

```sql
-- Denormalized mention list on the comment row (per spec)
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_task_comments_mentions
  ON public.task_comments USING GIN (mentions);

-- Parse @[Name](uuid) tokens from body on insert/update and keep mentions in sync
CREATE OR REPLACE FUNCTION public.task_comments_populate_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT (m[2])::uuid), '{}')
    INTO ids
  FROM regexp_matches(NEW.body, '@\[([^\]]+)\]\(([0-9a-f-]{36})\)', 'g') AS m;
  NEW.mentions := ids;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_comments_populate_mentions ON public.task_comments;
CREATE TRIGGER trg_task_comments_populate_mentions
  BEFORE INSERT OR UPDATE OF body ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comments_populate_mentions();

-- Fanout to task_mentions + notify edge function via pg_net
CREATE OR REPLACE FUNCTION public.task_comments_fanout_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  FOREACH uid IN ARRAY NEW.mentions LOOP
    IF uid <> NEW.author_id THEN
      INSERT INTO public.task_mentions
        (task_id, comment_id, mentioned_by, mentioned_user_id, source)
      VALUES (NEW.task_id, NEW.id, NEW.author_id, uid, 'comment')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  IF array_length(NEW.mentions, 1) > 0 THEN
    PERFORM net.http_post(
      url := current_setting('app.functions_url', true) || '/notify-comment-mentions',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)),
      body := jsonb_build_object('comment_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_comments_fanout_mentions ON public.task_comments;
CREATE TRIGGER trg_task_comments_fanout_mentions
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comments_fanout_mentions();

-- RLS: the existing "View comments" / "Insert comments" policies already scope
-- to company_members of the parent deal/task. No change needed.
```

(Note: `task_mentions` is the source of truth for notification UX — the `mentions` array on `task_comments` is the spec-requested denormalization for fast querying.)

### 2. Edge function `supabase/functions/notify-comment-mentions/index.ts`

```ts
// Pseudocode diff (new file)
serve(async (req) => {
  const { comment_id } = await req.json();
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: c } = await supa
    .from('task_comments')
    .select('id, body, mentions, author_id, task:task_id(id, title, deal_id)')
    .eq('id', comment_id).single();
  if (!c?.mentions?.length) return ok();

  const [{ data: author }, { data: targets }] = await Promise.all([
    supa.from('profiles').select('display_name, email').eq('user_id', c.author_id).single(),
    supa.from('profiles').select('user_id, display_name, email').in('user_id', c.mentions),
  ]);

  const plain = c.body.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1');
  const deepLink = `${APP_URL}/tasks/${c.task.id}?comment=${c.id}`;

  for (const t of targets ?? []) {
    if (!t.email || t.user_id === c.author_id) continue;
    // Idempotency: skip if notification_log already has (comment_id, t.user_id)
    const { count } = await supa.from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'task_mention').eq('ref_id', c.id).eq('user_id', t.user_id);
    if (count && count > 0) continue;

    // Resend via connector gateway
    await fetch('https://connector-gateway.lovable.dev/resend/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Naitive <notify@5thline.co>',
        to: [t.email],
        subject: `You were mentioned on "${c.task.title}"`,
        html: renderEmail({ commenter: author?.display_name, body: plain, title: c.task.title, link: deepLink }),
      }),
    });

    await supa.from('notification_log').insert({
      kind: 'task_mention', ref_id: c.id, user_id: t.user_id, channel: 'email'
    });
  }
});
```

Auth: `verify_jwt = false` (trigger calls with service role).

### 3. UI integration points (4 surfaces)

| # | Surface | File | Today | Change |
|---|---|---|---|---|
| a | Task drawer in a deal | `src/components/tasks/TaskDetailDrawer.tsx` | Uses `MentionTextarea` ✓ but doesn't fanout | After `addComment.mutate(...)` resolves with `newCommentId`, call `useCreateMentions().mutate({ taskId, text, commentId, source: 'comment' })`. Render existing comment bodies through `<MentionChips text={body} />` (new tiny component using `renderMentionText` + click→user preview). |
| b | Daily Rundown task cards | `src/components/dashboard/SuggestedTasksSection.tsx` + `MoffittDealRundown.tsx` | No composer; tasks shown as cards | Add an inline collapsed "Add comment" affordance per task card that opens the same `MentionTextarea`. Same submit handler (`useTaskComments(taskId).addComment` + mention fanout). |
| c | Deal Rundown task cards | `src/components/deals/DealsOverlay.tsx` | Same as (b) | Same inline composer; pass the deal context so `MentionTextarea`'s user list is filtered by the deal's company members. |
| d | My Tasks page | `src/components/tasks/ExpandedTaskDetails.tsx` | Plain `<textarea>` | Replace with `MentionTextarea`; wire mention fanout the same way. |

For all 4 surfaces we'll also extract a single reusable `<TaskCommentComposer taskId>` to dedupe — the four call sites become one-liners.

### 4. Tests

- `src/hooks/__tests__/taskMentionParser.test.ts` — unit tests for `extractMentions`: extracts ids, ignores `@plainName` without parens, dedupes repeats, ignores malformed UUIDs.
- `src/components/tasks/__tests__/TaskCommentComposer.test.tsx` — RTL test that typing `@Jam` opens the typeahead, Enter inserts a chip, submit calls `addComment` then `useCreateMentions`.
- `e2e/task-mention-notify.spec.ts` — Playwright: sign in as Niki, open a task, mention James Turner, assert (i) `task_mentions` row exists, (ii) `notification_log` row with `kind='task_mention'` exists, (iii) edge function logs show Resend POST.

### 5. Open questions (please confirm before I apply)

1. **Sender domain for Resend** — should the mention email go from `notify@5thline.co` (matches Daily Briefing) or a different verified address?
2. **Daily / Deal Rundown cards (surfaces b & c)** are read-only summaries today — do you want the composer **always visible** under each task card, or **revealed on hover/click** to keep the rundown dense?
3. The `mentions uuid[]` column is technically redundant with `task_mentions` rows. OK to keep both (one for fast filter queries, one for notification UX) — or do you want only one?

## Files touched (final list)

- `supabase/migrations/<ts>_task_comment_mentions.sql` (new)
- `supabase/functions/notify-comment-mentions/index.ts` (new)
- `src/components/tasks/TaskCommentComposer.tsx` (new, shared)
- `src/components/tasks/MentionChips.tsx` (new, shared renderer)
- `src/components/tasks/TaskDetailDrawer.tsx` (wire fanout + renderer)
- `src/components/tasks/ExpandedTaskDetails.tsx` (swap textarea → composer)
- `src/components/dashboard/SuggestedTasksSection.tsx` (add composer)
- `src/components/dashboard/MoffittDealRundown.tsx` (add composer)
- `src/components/deals/DealsOverlay.tsx` (add composer)
- `src/hooks/useTasks.ts` (extend `useTaskComments.addComment` to return new id so fanout can run)
- Tests: `src/hooks/__tests__/taskMentionParser.test.ts`, `src/components/tasks/__tests__/TaskCommentComposer.test.tsx`, `e2e/task-mention-notify.spec.ts`

Nothing is applied yet — confirm the three open questions and I'll ship it.
