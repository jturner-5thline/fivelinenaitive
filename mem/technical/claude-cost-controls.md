---
name: Claude cost controls
description: Deal Admin Agent response cache keyed on a signal fingerprint, and Anthropic prompt-cache block layout
type: feature
---

The Deal Admin Agent is ~99% of Anthropic spend. Two caches keep it down;
both must be preserved when editing `dealAdminAgentIntelligence.ts`.

## 1. Response cache (`dealAdminAgentModelCache.ts`)
Key = sha256 of company + deal + system text + **`signalKey`**, where
`signalKey` comes from `computeSignalFingerprint(bundle)` — ids and
`updated_at` stamps of every signal list, plus today's date.
NEVER key the cache on the raw prompt text: `buildUserPrompt` embeds a
rolling `since` timestamp and "business days since" counters, so a raw-prompt
key misses on every sweep (it did — 1 hit in 717 calls). TTL 24h.

## 2. Anthropic prompt caching
`callModelForCandidates` sends `system` as an **array of blocks**, not a string:
1. `SYSTEM_PROMPT_FULL` + JSON-only instruction — `cache_control: ephemeral`
2. company rules + pass-reason taxonomy — `cache_control: ephemeral`
3. per-deal knowledge-base block — **no** cache_control, must stay last

Anthropic only reads the cache on a byte-identical prefix, so deal-specific
text can never be folded into blocks 1-2. Verified: first deal in a sweep
writes ~19k cached tokens, every later deal reads them.
