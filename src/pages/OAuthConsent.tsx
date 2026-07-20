import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * OAuth 2.1 consent screen for the naitive API (MCP server).
 * Route: /.lovable/oauth/consent — Supabase Auth redirects here with an
 * ?authorization_id=... query when an external OAuth client (ChatGPT,
 * Claude, Codex, Cursor, etc.) is asking to act as this user.
 */
// Local typed wrapper — the supabase.auth.oauth namespace is beta and may not
// be fully typed. Only the three methods we actually call are declared.
type OAuthClient = { name?: string | null; client_uri?: string | null };
type AuthorizationDetails = {
  client?: OAuthClient | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in the URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?redirect=" + encodeURIComponent(next);
        return;
      }
      setUserEmail(sess.session.user.email ?? null);
      const { data, error: e } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (e) return setError(e.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: e } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (e) {
      setBusy(false);
      setError(e.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("The authorization server did not return a redirect URL.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-lg">
          <h1 className="text-lg font-semibold mb-2">Could not load this authorization request</h1>
          <p className="text-sm text-muted-foreground break-words">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const clientName = details.client?.name || "an external app";
  const scopes = (details.scope ?? "openid email profile").split(/\s+/).filter(Boolean);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">naitive API access request</span>
        </div>
        <h1 className="text-xl font-semibold mb-1">
          Connect {clientName} to your naitive account
        </h1>
        {userEmail && (
          <p className="text-sm text-muted-foreground mb-4">Signed in as {userEmail}</p>
        )}
        <p className="text-sm mb-4">
          {clientName} will be able to call naitive API tools while you are signed in. It acts as you and can
          only see or change what your naitive account already has access to.
        </p>
        <div className="rounded-md border border-border bg-muted/40 p-3 mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Requested access</p>
          <ul className="text-sm space-y-1">
            {scopes.map((s) => (
              <li key={s}>
                {s === "openid" || s === "profile"
                  ? "Share your basic profile"
                  : s === "email"
                    ? "Share your email address"
                    : `Additional permission: ${s}`}
              </li>
            ))}
            <li>Use naitive tools (deals, tasks, contacts, lenders) as you</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          This does not bypass naitive's permissions or backend policies.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => decide(false)} disabled={busy}>
            Cancel connection
          </Button>
          <Button onClick={() => decide(true)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
          </Button>
        </div>
      </div>
    </main>
  );
}