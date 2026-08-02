// Ingest a knowledge-base document uploaded to the `admin-agent-knowledge`
// storage bucket. Extracts text (via Lovable AI for binary/PDF, native decode
// for text/JSON/CSV), then updates the matching admin_agent_knowledge_docs row.
//
// Auth: requires the caller's JWT. The row is loaded with a user-scoped
// client so RLS enforces company ownership.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import mammoth from 'npm:mammoth@1.8.0';
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const MAX_TEXT_CHARS = 200_000; // truncate very large docs to keep prompts sane
const CHUNK_SIZE = 1500;         // ~character-based chunks for retrieval
const CHUNK_OVERLAP = 200;
const EMBED_MODEL = 'openai/text-embedding-3-small'; // 1536-dim, matches DB column
const EMBED_BATCH = 32;

function chunkText(text: string): string[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_SIZE, clean.length);
    // Prefer to break on a paragraph/sentence boundary near the cap.
    let cut = end;
    if (end < clean.length) {
      const window = clean.slice(i, end);
      const nl = window.lastIndexOf('\n\n');
      const per = window.lastIndexOf('. ');
      const b = Math.max(nl, per);
      if (b > CHUNK_SIZE * 0.5) cut = i + b + 1;
    }
    const piece = clean.slice(i, cut).trim();
    if (piece) out.push(piece);
    if (cut >= clean.length) break;
    i = Math.max(cut - CHUNK_OVERLAP, i + 1);
  }
  return out;
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY not configured');
  const res = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embeddings ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows.map((r: any) => r?.embedding as number[]);
}

function isTextish(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/csv' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  );
}

function isSpreadsheet(mime: string | null | undefined, filename: string): boolean {
  const m = (mime || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  return (
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.oasis.opendocument.spreadsheet' ||
    f.endsWith('.xlsx') ||
    f.endsWith('.xls') ||
    f.endsWith('.ods')
  );
}

function isDocx(mime: string | null | undefined, filename: string): boolean {
  const m = (mime || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  return (
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    f.endsWith('.docx')
  );
}

async function extractFromDocx(buf: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value || '';
}

function extractFromSpreadsheet(buf: Uint8Array): string {
  const wb = XLSX.read(buf, { type: 'array' });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`# Sheet: ${name}\n${csv}`);
  }
  return parts.join('\n\n');
}

async function extractViaClaude(base64: string, mime: string, filename: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');

  // Claude currently accepts application/pdf for the document content block.
  // Other binary types are not supported for document ingestion.
  if (mime !== 'application/pdf') {
    throw new Error(`Unsupported file type for Claude extraction: ${mime}`);
  }

  const res = await anthropicFetch({ feature: "admin-agent-knowledge-ingest" }, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      system:
        'You extract the full plain-text content of documents so an AI agent can use them as reference knowledge. Return ONLY the extracted text — no commentary, no markdown fences, no preamble. Preserve headings, lists, and tables as readable plain text.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: mime, data: base64 },
            },
            { type: 'text', text: `Extract the full text content of this document (${filename}).` },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const parts = Array.isArray(json?.content) ? json.content : [];
  return parts
    .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('\n')
    .trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to avoid stack overflow on large files.
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Service client — writes to admin_agent_knowledge_chunks (RLS restricts non-service writes).
    const svcClient = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { doc_id } = await req.json();
    if (!doc_id || typeof doc_id !== 'string') {
      return new Response(JSON.stringify({ error: 'doc_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load the row (RLS scopes to caller's companies).
    const { data: doc, error: docErr } = await userClient
      .from('admin_agent_knowledge_docs')
      .select('id, company_id, storage_path, mime_type, title, extracted_text, source_type')
      .eq('id', doc_id)
      .maybeSingle();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: 'Doc not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!doc.storage_path && !doc.extracted_text) {
      return new Response(JSON.stringify({ error: 'Doc has nothing to ingest' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download the file via the user client so storage RLS applies.
    const { data: blob, error: dlErr } = await userClient.storage
      .from('admin-agent-knowledge')
      .download(doc.storage_path);
    if (dlErr || !blob) {
      throw new Error(`Download failed: ${dlErr?.message ?? 'no blob'}`);
    }

    let extracted = '';
    try {
      if (doc.storage_path) {
        // Download the file via the user client so storage RLS applies.
        const { data: blob, error: dlErr } = await userClient.storage
          .from('admin-agent-knowledge')
          .download(doc.storage_path);
        if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message ?? 'no blob'}`);

        const mime = doc.mime_type || blob.type || 'application/octet-stream';
        if (isSpreadsheet(mime, doc.title)) {
          extracted = extractFromSpreadsheet(new Uint8Array(await blob.arrayBuffer()));
        } else if (isDocx(mime, doc.title)) {
          extracted = await extractFromDocx(new Uint8Array(await blob.arrayBuffer()));
        } else if (isTextish(mime)) {
          extracted = await blob.text();
        } else {
          const buf = new Uint8Array(await blob.arrayBuffer());
          extracted = await extractViaClaude(bytesToBase64(buf), mime, doc.title);
        }
      } else {
        // Pasted text — already stored on the row.
        extracted = String(doc.extracted_text || '');
      }

      const trimmed = (extracted || '').trim().slice(0, MAX_TEXT_CHARS);

      // Chunk + embed for retrieval.
      const chunks = chunkText(trimmed);
      // Wipe any prior chunks for this doc.
      await svcClient.from('admin_agent_knowledge_chunks').delete().eq('doc_id', doc.id);

      let totalChunks = 0;
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const vectors = await embedBatch(batch);
        const rows = batch.map((content, j) => ({
          doc_id: doc.id,
          company_id: doc.company_id,
          agent_key: 'admin_agent',
          chunk_index: i + j,
          content,
          embedding: vectors[j] as unknown as string,
          token_count: Math.ceil(content.length / 4),
        }));
        const { error: insErr } = await svcClient.from('admin_agent_knowledge_chunks').insert(rows);
        if (insErr) throw insErr;
        totalChunks += rows.length;
      }

      const { error: updErr } = await userClient
        .from('admin_agent_knowledge_docs')
        .update({
          extracted_text: trimmed,
          status: 'ready',
          error_message: null,
        })
        .eq('id', doc.id);
      if (updErr) throw updErr;

      return new Response(JSON.stringify({ ok: true, chars: trimmed.length, chunks: totalChunks }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      await userClient
        .from('admin_agent_knowledge_docs')
        .update({ status: 'error', error_message: (e as Error).message?.slice(0, 500) })
        .eq('id', doc.id);
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});