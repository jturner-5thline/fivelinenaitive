import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ASANA_API = "https://app.asana.com/api/1.0";

// --- AES-GCM encryption helpers (matching platform pattern) ---
async function getEncryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY not configured");
  const keyBytes = new TextEncoder().encode(raw.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function asanaFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana API error [${res.status}]: ${text}`);
  }

  return res.json();
}

// Resolve token: either from request body (test flow) or from DB (stored encrypted)
async function resolveToken(
  bodyToken: string | undefined,
  integrationId: string | undefined,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  if (bodyToken) return bodyToken;

  if (!integrationId) throw new Error("Either token or integration_id is required");

  const { data, error } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", integrationId)
    .single();

  if (error || !data?.config?.encrypted_token) {
    throw new Error("Integration not found or token missing");
  }

  return decrypt(data.config.encrypted_token);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, token, integration_id, ...params } = await req.json();

    let result: Record<string, unknown> = {};

    switch (action) {
      case "test": {
        if (!token) {
          return new Response(
            JSON.stringify({ success: false, error: "Token is required for test" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        const me = await asanaFetch("/users/me", token);
        const workspaces = me.data?.workspaces || [];

        // Encrypt the token for storage
        const encrypted_token = await encrypt(token);

        result = {
          success: true,
          user_name: me.data?.name,
          email: me.data?.email,
          workspace_name: workspaces[0]?.name || null,
          workspace_gid: workspaces[0]?.gid || null,
          encrypted_token,
        };
        break;
      }

      case "workspaces": {
        const resolvedToken = await resolveToken(token, integration_id, supabase);
        const me = await asanaFetch("/users/me", resolvedToken);
        result = { success: true, workspaces: me.data?.workspaces || [] };
        break;
      }

      case "projects": {
        const resolvedToken = await resolveToken(token, integration_id, supabase);
        const workspace = params.workspace_gid;
        const data = await asanaFetch(
          `/projects?workspace=${workspace}&opt_fields=name,color,archived,created_at`,
          resolvedToken
        );
        result = { success: true, projects: data.data || [] };
        break;
      }

      case "tasks": {
        const resolvedToken = await resolveToken(token, integration_id, supabase);
        const project = params.project_gid;
        const data = await asanaFetch(
          `/tasks?project=${project}&opt_fields=name,completed,due_on,assignee.name,assignee.email,notes,tags.name,created_at,modified_at`,
          resolvedToken
        );
        result = { success: true, tasks: data.data || [] };
        break;
      }

      case "create_task": {
        const resolvedToken = await resolveToken(token, integration_id, supabase);
        const data = await asanaFetch("/tasks", resolvedToken, {
          method: "POST",
          body: JSON.stringify({ data: params.task_data }),
        });
        result = { success: true, task: data.data };
        break;
      }

      case "update_task": {
        const resolvedToken = await resolveToken(token, integration_id, supabase);
        const data = await asanaFetch(`/tasks/${params.task_gid}`, resolvedToken, {
          method: "PUT",
          body: JSON.stringify({ data: params.task_data }),
        });
        result = { success: true, task: data.data };
        break;
      }

      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Asana proxy error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
