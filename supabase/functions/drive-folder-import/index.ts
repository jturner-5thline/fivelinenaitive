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
    const action = body.action as 'list' | 'browse' | 'search' | 'download' | 'tree' | 'automatch';

    // ---- Drive-backed data room: live recursive tree -----------------------
    if (action === 'tree') {
      const rootId = parseFolderId(String(body.folderId ?? body.folder ?? ''));
      if (!rootId) {
        return new Response(JSON.stringify({ error: 'invalid_folder', message: 'A Drive folder id or link is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const maxDepth = Math.min(Number(body.maxDepth ?? 4) || 4, 6);

      const metaRes = await gatewayFetch(
        `/drive/v3/files/${encodeURIComponent(rootId)}?fields=${encodeURIComponent('id,name,mimeType,trashed')}&supportsAllDrives=true`,
      );
      if (!metaRes.ok) {
        const errText = await metaRes.text();
        console.error(`Drive tree metadata failed [${metaRes.status}]: ${errText}`);
        return new Response(
          JSON.stringify({ error: 'inaccessible', status: metaRes.status, message: "That folder isn't accessible to the connected Drive account.", details: errText }),
          { status: metaRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const rootMeta = await metaRes.json();

      const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)');
      type Node = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; path: string; isFolder: boolean; parentPath: string };
      const nodes: Node[] = [];
      let truncated = false;
      const MAX_NODES = 3000;

      let frontier: { id: string; path: string }[] = [{ id: rootId, path: '' }];
      for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
        const next: { id: string; path: string }[] = [];
        // Fan out one level at a time, in parallel across the frontier.
        const results = await Promise.all(frontier.map(async (f) => {
          const q = encodeURIComponent(`'${f.id}' in parents and trashed = false`);
          const res = await gatewayFetch(
            `/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          );
          if (!res.ok) {
            const t = await res.text();
            console.error(`Drive tree list failed [${res.status}] for ${f.id}: ${t}`);
            return { parent: f, files: [] as any[] };
          }
          const parsed = await res.json();
          return { parent: f, files: (parsed.files ?? []) as any[] };
        }));

        for (const { parent, files } of results) {
          for (const file of files) {
            if (nodes.length >= MAX_NODES) { truncated = true; break; }
            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
            const path = parent.path ? `${parent.path}/${file.name}` : file.name;
            nodes.push({
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              size: file.size,
              modifiedTime: file.modifiedTime,
              webViewLink: file.webViewLink,
              path,
              parentPath: parent.path,
              isFolder,
            });
            if (isFolder) next.push({ id: file.id, path });
          }
        }
        frontier = next;
      }

      return new Response(
        JSON.stringify({ root: { id: rootMeta.id, name: rootMeta.name }, nodes, truncated }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Drive-backed data room: auto-match a folder by deal/company name ---
    if (action === 'automatch') {
      const name = String(body.name ?? '').trim();
      const parentId = parseFolderId(String(body.parentId ?? '')) ?? null;
      if (!name) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const escaped = name.replace(/'/g, "\\'");
      const clauses = [
        `mimeType = 'application/vnd.google-apps.folder'`,
        `trashed = false`,
        `name contains '${escaped}'`,
      ];
      if (parentId) clauses.push(`'${parentId}' in parents`);
      const q = encodeURIComponent(clauses.join(' and '));
      const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
      const res = await gatewayFetch(
        `/drive/v3/files?q=${q}&fields=${fields}&pageSize=25&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      );
      const text = await res.text();
      if (!res.ok) {
        console.error(`Drive automatch failed [${res.status}]: ${text}`);
        return new Response(
          JSON.stringify({ error: 'automatch_failed', status: res.status, details: text }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const parsed = JSON.parse(text);
      const target = name.toLowerCase();
      const scored = (parsed.files ?? []).map((f: any) => {
        const n = String(f.name ?? '').toLowerCase();
        const score = n === target ? 1 : n.startsWith(target) ? 0.85 : n.includes(target) ? 0.7 : 0.5;
        return { ...f, score };
      }).sort((a: any, b: any) => b.score - a.score);
      return new Response(JSON.stringify({ matches: scored }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list') {
      const folderId = parseFolderId(String(body.folder ?? ''));
      if (!folderId) {
        return new Response(JSON.stringify({
          error: 'invalid_url',
          message: "That doesn't look like a Google Drive folder link. Paste a URL like https://drive.google.com/drive/folders/…",
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Verify the target exists, is accessible, and is actually a folder.
      const metaRes = await gatewayFetch(
        `/drive/v3/files/${encodeURIComponent(folderId)}?fields=${encodeURIComponent('id,name,mimeType,trashed')}&supportsAllDrives=true`,
      );
      if (!metaRes.ok) {
        const errText = await metaRes.text();
        console.error(`Drive metadata failed [${metaRes.status}]: ${errText}`);
        const message = metaRes.status === 404
          ? "That folder doesn't exist or hasn't been shared with the connected Drive account."
          : metaRes.status === 403
            ? "The connected Drive account doesn't have access to that folder. Share it with the account and try again."
            : `Google Drive rejected the request (${metaRes.status}).`;
        return new Response(JSON.stringify({ error: 'inaccessible', status: metaRes.status, message, details: errText }), {
          status: metaRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const meta = await metaRes.json();
      if (meta?.trashed) {
        return new Response(JSON.stringify({
          error: 'trashed',
          message: `"${meta.name ?? 'That folder'}" is in the Drive trash. Restore it and try again.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (meta?.mimeType !== 'application/vnd.google-apps.folder') {
        return new Response(JSON.stringify({
          error: 'not_a_folder',
          message: `"${meta?.name ?? 'That link'}" points to a file, not a folder. Paste a folder URL instead.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          JSON.stringify({ error: 'list_failed', status: res.status, message: 'Failed to list folder contents.', details: text }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const parsed = JSON.parse(text);
      return new Response(JSON.stringify({ folder: { id: meta.id, name: meta.name }, ...parsed }), {
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