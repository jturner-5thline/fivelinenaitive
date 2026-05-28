/**
 * /studio — relocated Blog management workspace (Phase 3 of /admin redesign).
 * Hosts BlogManagementPanel with All Posts / New Post / Media tabs.
 * Admin-gated.
 */
import { useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { BlogManagementPanel } from "@/components/admin/BlogManagementPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Newspaper, Plus, Image as ImageIcon, ChevronRight } from "lucide-react";

type Tab = "all" | "new" | "media";
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All Posts", icon: Newspaper },
  { id: "new", label: "New Post", icon: Plus },
  { id: "media", label: "Media Library", icon: ImageIcon },
];

export default function Studio() {
  const { isAdmin, isLoading } = useAdminRole();
  const [params, setParams] = useSearchParams();
  const tab = useMemo<Tab>(() => {
    const t = params.get("tab");
    return t === "new" || t === "media" ? t : "all";
  }, [params]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/deals" replace />;

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: false });
  };

  return (
    <div className="bg-background">
      <div className="container mx-auto py-5 px-4 space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Newspaper className="h-3.5 w-3.5" />
          <span>Studio</span>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="text-foreground font-medium">{TABS.find(t => t.id === tab)?.label}</span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg w-max">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <BlogManagementPanel subTab={tab} />
      </div>
    </div>
  );
}