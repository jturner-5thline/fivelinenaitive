---
name: Agent self-learning system
description: Admin Agent (and any future agent) synthesizes learned rules from approval-queue feedback (approvals, edits, rejections); rules injected into prompts alongside custom rules
type: feature
---
- Storage: `agent_learned_rules` (company_id, agent_key, rule_text, evidence, source, status proposed|active|dismissed, confidence, occurrences). RLS scoped to company_members.
- Synthesis: edge function `agent-learn-from-feedback` reads `approval_queue_audit` joined to `ai_action_queue` for the company over the lookback window, calls Claude Sonnet 4.5, dedupes against existing custom + learned rules, inserts as `proposed`.
- Scheduled: pg_cron `agent-learn-weekly` Sunday 23:00 UTC for every company with `company_agent_access.admin_agent.is_enabled`. Manual trigger via "Train now" button.
- Injection: both `copilot-chat` (Ask nAItive AI) and `_shared/dealAdminAgentIntelligence.ts` (proactive sweep) inject ACTIVE learned rules into the system prompt alongside ADMIN AGENT CUSTOM RULES. Proposed rules do NOT influence the agent until accepted.
- UI: "Learned patterns" section in `AdminAgentDuty1Config` (Accept / Dismiss / Retire). Always visible when company is entitled.