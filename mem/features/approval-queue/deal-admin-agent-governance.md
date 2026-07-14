---
name: Approval Queue Deal Admin Agent governance
description: Every ai_action_queue insert is gated by admin_agent_settings.enabled via a DB trigger — flipping the agent off is a true kill-switch across every writer (client + edge)
type: feature
---
- DB trigger `enforce_admin_agent_enabled_on_ai_action_queue` runs BEFORE INSERT on `public.ai_action_queue` and raises if `admin_agent_settings.enabled` is not `true` for the resolved company.
- Company resolution order: `NEW.deal_id → deals.company_id`, then fallback to the creator's primary `public.company_members.company_id` (oldest by `created_at`).
- Covers every writer with one guard: `useAiActionQueue` client inserts, Deal Admin Agent edge functions, `analyze-emails`, `draft-lender-question-response`, `agent-learn-from-feedback` follow-ups, Claap paths, and any future producer.
- If a writer needs to create a queue item on behalf of a workspace where the agent is off, the correct action is to turn the agent on — not to bypass the trigger.