import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_drive';
const INTERNAL_DOMAINS = new Set(['5thline.co', 'naitive.co']);

function domainOf(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase().replace(/^www\./, '');
}

function parseFolderId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const m1 = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function gatewayFetch(path: string, init: RequestInit = {}) {
  const url = `${GATEWAY}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`);
  headers.set('X-Connection-Api-Key', Deno.env.get('GOOGLE_DRIVE_API_KEY') ?? '');
  return fetch(url, { ...init, headers });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!INTERNAL_DOMAINS.has(domainOf(user.email))) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const action = body.action as 'list' | 'browse' | 'search' | 'download';

    if (action === 'list') {
      const folderId = parseFolderId(String(body.folder ?? ''));
      if (!folderId) {
        return new Response(JSON.stringify({ error: 'Invalid folder URL or ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime)');
      const res = await gatewayFetch(
        `/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      );
      const text = await res.text();
      if (!res.ok) {
        console.error(`Drive list failed [${res.status}]: ${text}`);
        return new Response(
          JSON.stringify({ error: 'Drive list failed', status: res.status, details: text }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(text, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'browse') {
      const folderId = String(body.folderId ?? 'root').trim() || 'root';
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime,parents)');
      const res = await gatewayFetch(
        `/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      );
      const text = await res.text();
      if (!res.ok) {
        console.error(`Drive browse failed [${res.status}]: ${text}`);
        return new Response(
          JSON.stringify({ error: 'Drive browse failed', status: res.status, details: text }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // Also fetch folder metadata for breadcrumb (skip for root)
      let folderMeta: any = { id: 'root', name: 'My Drive' };
      if (folderId !== 'root') {
        const metaRes = await gatewayFetch(
          `/drive/v3/files/${encodeURIComponent(folderId)}?fields=${encodeURIComponent('id,name,parents')}&supportsAllDrives=true`,
        );
        if (metaRes.ok) folderMeta = await metaRes.json();
      }
      return new Response(JSON.stringify({ folder: folderMeta, ...JSON.parse(text) }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'search') {
      const query = String(body.query ?? '').trim().replace(/'/g, "\\'");
      if (!query) {
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const q = encodeURIComponent(`name contains '${query}' and trashed = false`);
      const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime,parents)');
      const res = await gatewayFetch(
        `/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      );
      const text = await res.text();
      if (!res.ok) {
        console.error(`Drive search failed [${res.status}]: ${text}`);
        return new Response(
          JSON.stringify({ error: 'Drive search failed', status: res.status, details: text }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(text, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'download') {
      const fileId = String(body.fileId ?? '').trim();
      const mimeType = String(body.mimeType ?? '');
      if (!fileId) {
        return new Response(JSON.stringify({ error: 'fileId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Google native docs must be exported, not downloaded.
      let path: string;
      let downloadMime = mimeType;
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        const exportMap: Record<string, string> = {
          'application/vnd.google-apps.document':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.google-apps.spreadsheet':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.google-apps.presentation':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.google-apps.drawing': 'application/pdf',
        };
        const target = exportMap[mimeType] ?? 'application/pdf';
        downloadMime = target;
        path = `/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(target)}`;
      } else {
        path = `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
      }

      const res = await gatewayFetch(path);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Drive download failed [${res.status}]: ${errText}`);
        return new Response(
          JSON.stringify({ error: 'Drive download failed', status: res.status, details: errText }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      // base64 encode
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const b64 = btoa(bin);
      return new Response(
        JSON.stringify({ base64: b64, mimeType: downloadMime, size: buf.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('drive-folder-import error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});