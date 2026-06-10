import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dev-only floating panel that lists the 10 most recent Asana sync log
 * entries. Helps diagnose why a task did or didn't make it into Asana.
 * Rendered only when `import.meta.env.DEV` is true.
 */
interface LogRow {
  id: string;
  action: string;
  success: boolean;
  http_status: number | null;
  error_message: string | null;
  attempt_number: number | null;
  task_id: string | null;
  asana_task_gid: string | null;
  created_at: string;
}

export function AsanaSyncDebug() {
  if (!import.meta.env.DEV) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [rows, setRows] = useState<LogRow[]>([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [authed, setAuthed] = useState(false);
  const successCount = rows.filter((r) => r.success).length;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthed(!!data.user);
    });
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAuthed(!!session?.user);
    });
    return () => { active = false; sub.data.subscription.unsubscribe(); };
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!open || !authed) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('asana_sync_log' as any)
        .select('id, action, success, http_status, error_message, attempt_number, task_id, asana_task_gid, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!cancelled && data) setRows(data as any);
    };
    load();
    const i = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(i); };
  }, [open, authed]);

  if (!authed) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        zIndex: 9999,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.3,
        padding: "6px 8px",
        borderRadius: 6,
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.15)",
        maxWidth: 420,
        maxHeight: open ? 360 : 28,
        overflow: "auto",
      }}
      data-testid="asana-sync-debug"
    >
      <div
        style={{ cursor: "pointer", userSelect: "none", fontWeight: 600 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▼" : "▶"} Asana sync log ({successCount})
      </div>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.length === 0 && <div style={{ opacity: 0.6 }}>no entries</div>}
          {rows.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 4 }}>
              <div>
                <span style={{ color: r.success ? "#4ade80" : "#f87171" }}>
                  {r.success ? "OK" : "FAIL"}
                </span>{" "}
                {r.action} {r.http_status ?? ""} a{r.attempt_number ?? 1}
              </div>
              <div style={{ opacity: 0.7 }}>{new Date(r.created_at).toLocaleTimeString()}</div>
              {r.error_message && (
                <div style={{ color: "#fca5a5", whiteSpace: "pre-wrap" }}>{r.error_message}</div>
              )}
              {r.asana_task_gid && (
                <div style={{ opacity: 0.6 }}>gid: {r.asana_task_gid}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}