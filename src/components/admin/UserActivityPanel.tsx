import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Search } from "lucide-react";

interface ActivityRow {
  id: string;
  user_id: string;
  company_id: string | null;
  event_type: string;
  event_data: any;
  created_at: string;
  email?: string | null;
  display_name?: string | null;
}

const EVENT_TYPES = ["all", "sign_in", "sign_out", "page_view"];

const eventBadgeClass = (type: string) => {
  switch (type) {
    case "sign_in":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "sign_out":
      return "bg-muted text-muted-foreground";
    case "page_view":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    default:
      return "bg-white/10 text-white/60";
  }
};

export const UserActivityPanel = () => {
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-activity", eventType],
    queryFn: async () => {
      let q = supabase
        .from("user_activity_log")
        .select("id, user_id, company_id, event_type, event_data, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (eventType !== "all") q = q.eq("event_type", eventType);
      const { data: rows, error } = await q;
      if (error) throw error;

      const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)));
      let profilesMap = new Map<string, { email: string | null; display_name: string | null }>();
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, email, display_name, first_name, last_name")
          .in("user_id", userIds);
        profilesMap = new Map(
          (profiles ?? []).map((p: any) => [
            p.user_id,
            {
              email: p.email ?? null,
              display_name:
                p.display_name ||
                [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                null,
            },
          ])
        );
      }

      return (rows ?? []).map((r) => ({
        ...r,
        email: profilesMap.get(r.user_id)?.email ?? null,
        display_name: profilesMap.get(r.user_id)?.display_name ?? null,
      })) as ActivityRow[];
    },
    refetchInterval: 30_000,
  });

  const filtered = (data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.email?.toLowerCase().includes(s) ||
      r.display_name?.toLowerCase().includes(s) ||
      r.event_type.toLowerCase().includes(s) ||
      JSON.stringify(r.event_data ?? {}).toLowerCase().includes(s)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          User Activity
        </CardTitle>
        <CardDescription>
          Recent sign-ins, sign-outs, and page views across all users (last 500 events).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search user, event, or path..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "all" ? "All events" : t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No activity found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const path =
                    row.event_data?.path ||
                    row.event_data?.url ||
                    row.event_data?.route ||
                    "";
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {row.display_name || row.email || row.user_id?.slice(0, 8) || "Unknown"}
                          </span>
                          {row.email && row.display_name && (
                            <span className="text-xs text-muted-foreground">{row.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={eventBadgeClass(row.event_type)}>
                          {row.event_type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                        {path || (row.event_data ? JSON.stringify(row.event_data) : "-")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" title={format(new Date(row.created_at), "PPpp")}>
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};