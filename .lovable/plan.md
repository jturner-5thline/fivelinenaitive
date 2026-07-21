# Knowledge Test for the Deal Admin Agent

A single button in the agent's Knowledge Base tab that (1) auto-generates a set of questions from the docs already ingested, (2) asks the agent each question through the same RAG retrieval path it uses in production, and (3) grades whether the answer actually cites the right source passage. Results render as a scorecard with per-question pass/fail, the retrieved passages, and the citations.

## User flow

1. In the Deal Admin Agent Configure popup → Knowledge tab, a new "Run Knowledge Test" button appears above the docs list.
2. Clicking it opens a modal that streams progress: "Generating questions…", "Question 1/10…", etc.
3. When done: a scorecard shows overall score (e.g. 8/10 correct), each question with the agent's answer, the top retrieved chunk, the expected doc, and a pass/fail badge with reasoning.
4. A "Re-run" button and a "View last run" affordance let the user compare over time. Prior runs persist per company.

## Backend

New edge function `admin-agent-knowledge-test` (JWT-verified, service-role for reads):

1. Loads all `status='ready'` docs + chunks for the company, honoring the agent's `knowledge_tag_filter` if set (matches production behavior).
2. **Question generation pass** — one Claude Sonnet 4.5 call given a compact digest (title + tags + first ~800 chars of each doc, capped) that returns a JSON array of ~10 test items: `{ question, expected_doc_id, expected_snippet, rubric }`. Distribute across docs (at least one per doc when total docs ≤ 10; otherwise sample).
3. **Answering pass** — for each question, run the same retrieval path the agent uses in prod: call the existing `match_admin_agent_knowledge` RPC with the same tag filter, then send the retrieved passages + question to Claude with the same "ADMIN AGENT KNOWLEDGE BASE" injection block. Capture the answer, the top 3 retrieved chunk ids, and their doc ids.
4. **Grading pass** — one Claude call per question with a strict rubric: pass only if (a) the answer is factually consistent with `expected_snippet` and (b) the retrieval included `expected_doc_id` in the top-3. Returns `{ pass: boolean, reason: string, retrieval_hit: boolean, answer_hit: boolean }`.
5. Persists the run to a new `admin_agent_knowledge_test_runs` table (company-scoped, RLS) with `run_id`, `questions_jsonb`, `results_jsonb`, `score`, `total`, `created_by`, `created_at`. Returns the payload to the client.

## Storage

New table `admin_agent_knowledge_test_runs`:
- `id uuid pk`, `company_id uuid`, `agent_key text default 'admin_agent'`
- `score int`, `total int`, `tag_filter text[]`
- `questions jsonb` (generated items), `results jsonb` (per-question answer/retrieval/grade)
- `created_by uuid`, `created_at timestamptz default now()`
- RLS: company members can select; only same company + auth user can insert; grants for `authenticated` + `service_role`.

## Frontend

- New component `src/components/agents/KnowledgeTestDialog.tsx` — the modal with streaming progress, scorecard, and history list.
- New hook `src/hooks/useAdminAgentKnowledgeTest.ts` — invokes the edge function, exposes `run()`, `isRunning`, `latestRun`, `history`.
- Wire a "Run Knowledge Test" button into the existing Knowledge Base tab inside `AdminAgentDuty1Config` (per the `mem://features/agents/knowledge-base-tab` pattern). Button disabled when 0 ready docs; shows last score badge next to it.
- Scorecard layout: overall score header, then a collapsible list of questions with:
  - Question text
  - Pass/fail badge (green/red)
  - Agent's answer
  - Expected source (doc title + snippet)
  - Retrieved chunks (doc titles) with a "matched expected doc" indicator
  - Grader reasoning
- History: last 10 runs listed with date + score, click to reopen the scorecard.

## Behavior guarantees

- The test uses the exact same RPC + prompt injection the production agent uses, so a pass means retrieval genuinely surfaces the doc for a realistic question. No side-channel that bypasses the RAG path.
- Honors the current `knowledge_tag_filter` — if untagged docs would be filtered out in prod, they're filtered here too, so the test reflects reality.
- No writes to `admin_agent_knowledge_docs` or chunks; test is read-only against the KB.
- Uses `google/gemini-3.5-flash` for question generation + grading (fast, cheap, sufficient for JSON scoring); the answering pass uses the same model the production agent uses.

## Files

New:
- `supabase/functions/admin-agent-knowledge-test/index.ts`
- `supabase/migrations/<timestamp>_admin_agent_knowledge_test_runs.sql`
- `src/components/agents/KnowledgeTestDialog.tsx`
- `src/hooks/useAdminAgentKnowledgeTest.ts`

Modified:
- The existing Knowledge tab component inside the Deal Admin Agent Configure popup (adds the button + last-score badge).
