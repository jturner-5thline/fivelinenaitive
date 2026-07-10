## Goal
Move the true "agents" and every email-extraction function off `google/gemini-*` on the Lovable AI Gateway and onto `claude-sonnet-4-5-20250929` via the Anthropic Messages API (same pattern the Deal Admin Agent already uses).

`ANTHROPIC_API_KEY` is already configured — no new secrets needed.

## Functions to migrate (13)

**Agents (autonomous decisions / write to queues)**
1. `dashboard-chat` — main conversational agent (multiple call sites)
2. `james-top-priority` — daily prioritization agent
3. `field-suggestion-engine` — writes to `contact_field_suggestions` approval queue (uses tool calling)
4. `vdr-suggestions` — VDR action proposals
5. `email-unified-action` — routes email actions (uses tool calling)
6. `claap-suggest-matches` — meeting↔deal routing decisions

**Email extraction**
7. `analyze-emails` — email classification + signal extraction
8. `detect-email-followups` — followup detection (uses tool calling)
9. `email-thread-summarizer` — thread summary (uses `response_format: json_object`)
10. `parse-email-scheduling-proposals` — extracts proposed slots (uses `response_format: json_object`)
11. `email-ai-search` — semantic email search
12. `polish-email-draft` — polishes draft emails
13. `lender-followup-draft` — drafts lender follow-ups

## Not migrating (staying on Gemini)
Pure extractors/summarizers/drafters that aren't email-related: `ai-news-summary`, `generate-activity-summary`, `lender-summary`, `claap-analyze-meeting`, `claap-extract-action-items`, `extract-lender-fit`, `extract-deal-fit`, `branded-doc-style-extract`, `naitive-task-parse`, `financial-ai`, `semantic-lender-match`, `ai-settings-tool`, `gamma-ai-prompt`. Perplexity calls (`sonar-pro`) inside `dashboard-chat` stay on Perplexity.

## Shared helper
Create `supabase/functions/_shared/claudeChat.ts` exporting:
- `callClaude({ system, messages, tools?, toolChoice?, maxTokens?, temperature? })` — POSTs to `https://api.anthropic.com/v1/messages` and returns `{ text, toolUse, stopReason, usage }`.
- Handles OpenAI-shape → Anthropic-shape conversion for `tools` (`{name, description, input_schema}`) and `tool_choice` (`{type:"tool", name}`).
- Handles Anthropic response shape: text lives in `content[]` blocks of type `text`; tool calls in blocks of type `tool_use`.
- Surfaces `429` and `529` as retryable, everything else terminal.
- No streaming — all 13 targets are one-shot.

## Per-function changes
For each of the 13 functions:
1. Replace the `fetch(https://ai.gateway.lovable.dev/v1/chat/completions, ...)` block with `callClaude(...)`.
2. Remove `response_format: json_object` — instead instruct in the system prompt "return only valid JSON" (already the case in most). Existing JSON-cleaning code (`replace(/^```json/…)`) stays as belt-and-suspenders.
3. For the 3 tool-calling functions (`detect-email-followups`, `field-suggestion-engine`, `email-unified-action`, plus tool paths inside `dashboard-chat`): read the tool_use block from Claude's response instead of `choices[0].message.tool_calls[0].function.arguments`.
4. Keep temperature values as-is; Claude accepts the same 0–1 range.

## Not touched
- `dealAdminAgentIntelligence.ts` — already on Claude.
- `widget-builder-chat`, `branded-doc-generate`, `claude-ai`, `claude-dashboard-chat` — already on Claude.
- All non-migrating functions listed above stay on Gemini.

## Verification
After the swap, run one of each shape end-to-end via `supabase--curl_edge_functions`:
- A plain-text call (`polish-email-draft`)
- A JSON-mode call (`analyze-emails`)
- A tool-calling call (`field-suggestion-engine`)

Confirm each returns a well-formed response and the AI Gateway logs (or absence thereof) show the traffic moved off Gemini.

## Cost & latency note
Claude Sonnet 4.5 is meaningfully more expensive and slower per token than `gemini-2.5-flash*`. Expect ~5–10× cost and ~2× latency on these paths. Worth it for the agent paths; you flagged that this is the tradeoff you want for email extraction too.
