# Embeddings model fix — disable broken calls, leave supported ones running

## Audit

Embeddings calls to `https://ai.gateway.lovable.dev/v1/embeddings` across the project:

**Unsupported model (`"text-embedding-3-small"`, missing the `openai/` prefix → 400 from the gateway):**
1. `supabase/functions/vdr-chat/index.ts` ~line 39-52 (VDR Q&A retrieval)
2. `supabase/functions/vdr-ingest/index.ts` ~line 179-193 (chunk embedding on ingest)
3. `supabase/functions/vdr-irl-match/index.ts` ~line 102-116 (IRL semantic search)
4. `supabase/functions/copilot-chat/index.ts` ~line 3432-3439 (copilot VDR semantic search tool)

**Already on a supported model (`"openai/text-embedding-3-small"`) — leave alone:**
- `supabase/functions/extract-deal-fit/index.ts` (`EMBEDDING_MODEL` constant)
- `supabase/functions/recommend-lenders/index.ts` (`EMBEDDING_MODEL` constant)
- `supabase/functions/extract-lender-fit/index.ts` (`EMBEDDING_MODEL` constant)

## Dimension check

Every pgvector column written/queried by the broken calls is `vector(1536)`:
- `vdr_document_chunks.embedding vector(1536)` and `_query_embedding vector(1536)` in the matching RPC (migration `20260320212658_*`)
- `vdr_irl_requests` / matching RPC `vector(1536)` (migration `20260520131841_*`)
- copilot-chat uses the same VDR chunks RPC.

`openai/text-embedding-3-small` returns 1536 dims natively, so no `dimensions` override and no column changes are needed.

## Changes (4 edge functions)

For each of the four files, in the specific `fetch("https://ai.gateway.lovable.dev/v1/embeddings", …)` call:

1. Update the request body's `model` field from `"text-embedding-3-small"` to `"openai/text-embedding-3-small"` (the corrected, supported id).
2. Comment out **only that fetch call and the immediately surrounding code that consumes its response** (the `embData`/`queryEmbedding`/`embedding` parsing for that call), so the function still compiles and the route continues to serve requests — semantic search will simply fall through to its existing non-embedding fallback path (which already exists in all four files: keyword search in vdr-chat / copilot-chat, ingest stores `embedding: null`, IRL falls back to non-semantic match).
3. Prefix the disabled block with the exact marker comment:
   `// Disabled by Lovable - model fixed; uncomment to re-enable`
4. Leave the corrected `model: "openai/text-embedding-3-small"` string inside the commented block so re-enabling is a pure uncomment with no further edits.

No other behaviour, schemas, RPCs, or column types change. The three already-supported callers are not touched.

## Out of scope

- No DB migrations (dimensions already match).
- No rewrites of the fallback paths — they already handle a null/absent embedding.
- No changes to `extract-deal-fit`, `recommend-lenders`, or `extract-lender-fit`.
