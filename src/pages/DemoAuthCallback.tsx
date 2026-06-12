import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Magic-link landing for demo invites. Supabase appends the access/refresh
 * tokens to the URL hash (`#access_token=...&refresh_token=...&type=magiclink`).
 * We hydrate the session from those tokens (or fall back to the already-stored
 * session if the SDK consumed the hash automatically), then route directly
 * into the seeded demo workspace at /deals.
 */
export default function DemoAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        const errorDescription = hashParams.get("error_description");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setErr) throw setErr;
          // Clean tokens from the URL so they don't leak in history/referrers.
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        }

        // Wait until the SDK has a session ready, then route to Deals.
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.user) {
          navigate("/deals", { replace: true });
        } else {
          // No session — fall back to login rather than the marketing homepage.
          navigate("/login", { replace: true });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to sign in.");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
      {error ? (
        <>
          <p className="text-sm text-destructive">{error}</p>
          <button
            className="text-sm underline text-muted-foreground"
            onClick={() => navigate("/login", { replace: true })}
          >
            Continue to sign in
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Opening your demo workspace…</p>
        </>
      )}
    </div>
  );
}