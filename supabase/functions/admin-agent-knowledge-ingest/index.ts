// Ingest a knowledge-base document uploaded to the `admin-agent-knowledge`
// storage bucket. Extracts text (via Lovable AI for binary/PDF, native decode
// for text/JSON/CSV), then updates the matching admin_agent_knowledge_docs row.
//
// Auth: requires the caller's JWT. The row is loaded with a user-scoped
// client so RLS enforces company ownership.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const MAX_TEXT_CHARS = 200_000; // truncate very large docs to keep prompts sane

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

async function extractViaLovableAI(base64: string, mime: string, filename: string): Promise<string> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY not configured');

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': key,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content:
            'You extract the full plain-text content of documents so an AI agent can use them as reference knowledge. Return ONLY the extracted text — no commentary, no markdown fences, no preamble. Preserve headings, lists, and tables as readable plain text.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extract the full text content of this document (${filename}).` },
            {
              type: 'file',
              file: {
                filename,
                file_data: `data:${mime};base64,${base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lovable AI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? '';
  return typeof text === 'string' ? text : '';
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
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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
      .select('id, company_id, storage_path, mime_type, title')
      .eq('id', doc_id)
      .maybeSingle();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: 'Doc not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!doc.storage_path) {
      return new Response(JSON.stringify({ error: 'Doc has no file to ingest' }), {
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
    const mime = doc.mime_type || blob.type || 'application/octet-stream';

    try {
      if (isSpreadsheet(mime, doc.title)) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        extracted = extractFromSpreadsheet(buf);
      } else if (isTextish(mime)) {
        extracted = await blob.text();
      } else {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const b64 = bytesToBase64(buf);
        extracted = await extractViaLovableAI(b64, mime, doc.title);
      }
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

    const trimmed = (extracted || '').trim().slice(0, MAX_TEXT_CHARS);

    const { error: updErr } = await userClient
      .from('admin_agent_knowledge_docs')
      .update({
        extracted_text: trimmed,
        status: 'ready',
        error_message: null,
      })
      .eq('id', doc.id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true, chars: trimmed.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});