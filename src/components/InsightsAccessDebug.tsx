import { useAuth } from "@/contexts/AuthContext";
import { useCanAccessInsightsStatus } from "@/hooks/useCanAccessInsights";

/**
 * Dev-only floating badge that shows the current user's email and whether
 * the Insights allowlist hook resolves to `true`. Rendered only when
 * `import.meta.env.DEV` is true so it never ships to production builds.
 */
export function InsightsAccessDebug() {
  if (!import.meta.env.DEV) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { allowed, isLoading } = useCanAccessInsightsStatus();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 9999,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.3,
        padding: "6px 8px",
        borderRadius: 6,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.15)",
        pointerEvents: "none",
        maxWidth: 320,
      }}
      data-testid="insights-access-debug"
    >
      <div>email: {user?.email ?? "(none)"}</div>
      <div>
        canSeeInsights:{" "}
        {isLoading ? "loading…" : allowed ? "true" : "false"}
      </div>
    </div>
  );
}
