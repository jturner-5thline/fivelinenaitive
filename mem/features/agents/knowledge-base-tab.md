---
name: Agent Configure Popup Knowledge Base
description: Every "Configure Agent" popup should expose a Knowledge Base tab where users upload reference docs the agent digests
type: feature
---
Every agent configuration popup must include a Knowledge Base tab. Users upload documents (rules, requirements, definitions, glossary, workflow, etc.) or paste text; the agent reads and applies them as authoritative reference context on every run.

Implementation pattern (established for Deal Admin Agent):
- Storage: private bucket `admin-agent-knowledge`, path `{company_id}/{uuid}-{filename}`.
- Table: `admin_agent_knowledge_docs` (title, source_type file|text, storage_path, mime_type, size_bytes, extracted_text, status pending|ready|error, agent_key).
- Ingest edge function: `admin-agent-knowledge-ingest` — text-ish MIME decoded directly; PDFs/DOCX/binary extracted via Lovable AI `google/gemini-2.5-flash` multimodal `file` block.
- Prompt injection: on every model run load `status='ready'` docs and append an "ADMIN AGENT KNOWLEDGE BASE" section (per-doc cap 8000 chars, total cap 60000 chars). Wired in `supabase/functions/_shared/dealAdminAgentIntelligence.ts` and `supabase/functions/copilot-chat/index.ts`.

When new agent configure popups are added, replicate this same tab (upload + paste + list + re-ingest + delete) and inject the knowledge base into that agent's prompt path, scoped by `agent_key`.

## Document tagging + prompt filter
- Docs carry a `tags text[]` column constrained to: `rules`, `requirements`, `definitions`, `glossary`, `workflow`, `other`.
- Agent settings carry `knowledge_tag_filter text[]` (same enum). Empty array = include ALL docs (tagged + untagged). Non-empty = only docs whose tags overlap the filter are injected.
- Both prompt-injection paths (`_shared/dealAdminAgentIntelligence.ts` and `copilot-chat/index.ts`) apply the filter with `.overlaps('tags', tagFilter)` and append each doc's tags to its heading. Replicate this pattern for any new agent that adopts the Knowledge Base tab.