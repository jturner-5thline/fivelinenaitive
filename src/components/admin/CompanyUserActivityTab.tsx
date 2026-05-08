import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity as ActivityIcon, LogIn, LogOut, Eye, Sparkles } from "lucide-react";

interface Props {
  companyId: string;
}

const eventMeta: Record<string, { label: string; tone: string; icon: JSX.Element }> = {
  sign_in:    { label: "Signed in",  tone: "bg-green-500/20 text-green-400 border-green-500/30", icon: <LogIn className="h-3 w-3" /> },
  sign_out:   { label: "Signed out", tone: "bg-white/10 text-white/60 border-white/20",          icon: <LogOut className="h-3 w-3" /> },
  page_view:  { label: "Page view",  tone: "bg-blue-500/20 text-blue-400 border-blue-500/30",    icon: <Eye className="h-3 w-3" /> },
  feature_used: { label: "Feature",  tone: "bg-purple-500/20 text-purple-300 border-purple-500/30", icon: <Sparkles className="h-3 w-3" /> },
};

export const CompanyUserActivityTab = ({ companyId }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["company-user-activity", companyId],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("user_activity_log")
        .select("id, user_id, event_type, event_data, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const userIds = Array.from(new Set((events ?? []).map((e) => e.user_id)));
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .in("user_id", userIds)
        : { data: [] as Array<{ user_id: string; display_name: string | null; email: string | null }> };

      const map = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return (events ?? []).map((e) => ({
        ...e,
        profile: map.get(e.user_id),
      }));
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <ActivityIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No user activity recorded yet.</p>
        <p className="text-xs mt-1">Sign-ins and page views will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((e) => {
        const meta = eventMeta[e.event_type] ?? {
          label: e.event_type,
          tone: "bg-white/10 text-white/60 border-white/20",
          icon: <ActivityIcon className="h-3 w-3" />,
        };
        const data = (e.event_data ?? {}) as Record<string, unknown>;
        const path = typeof data.path === "string" ? data.path : null;
        const detail =
          typeof data.feature === "string"
            ? String(data.feature)
            : typeof data.label === "string"
              ? String(data.label)
              : null;
        return (
          <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <Badge variant="outline" className={`gap-1 ${meta.tone}`}>
              {meta.icon}
              {meta.label}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {e.profile?.display_name || e.profile?.email || "Unknown user"}
              </p>
              {(path || detail) && (
                <p className="text-xs text-muted-foreground truncate">
                  {detail ?? path}
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
};