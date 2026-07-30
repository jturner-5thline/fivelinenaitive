import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bug, Lightbulb, MessageSquare, Star, Search, X, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface FeedbackItem {
  id: string;
  user_id: string;
  title: string | null;
  message: string;
  type: string | null;
  category: string | null;
  rating: number | null;
  status: string;
  page_url: string | null;
  company_id: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
  company_name?: string;
}

const STATUSES = ["new", "reviewed", "in_progress", "done"] as const;
const STATUS_LABEL: Record<string, string> = {
  new: "New", reviewed: "Reviewed", in_progress: "In Progress", done: "Done",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  new: "destructive", reviewed: "secondary", in_progress: "default", done: "outline",
};

const CATEGORIES = ["bug", "feature", "general"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  bug: "Bug", feature: "Feature Request", general: "General",
};

const StarRating = ({ value }: { value: number | null }) => {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
};

export function FeedbackTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const { data: feedback, isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const userIds = [...new Set((data ?? []).map((f) => f.user_id))];
      const companyIds = [...new Set((data ?? []).map((f) => f.company_id).filter(Boolean) as string[])];
      const [{ data: profiles }, { data: members }, { data: companies }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("company_members").select("user_id, company_id").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        companyIds.length
          ? supabase.from("companies").select("id, name").in("id", companyIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const pmap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const memberCompany = new Map((members ?? []).map((m: any) => [m.user_id, m.company_id]));
      const cmap = new Map((companies ?? []).map((c) => [c.id, c.name]));
      const missingCompanyIds = [
        ...new Set(
          [...memberCompany.values()].filter((id): id is string => !!id && !cmap.has(id)),
        ),
      ];
      if (missingCompanyIds.length) {
        const { data: extra } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", missingCompanyIds);
        (extra ?? []).forEach((c: any) => cmap.set(c.id, c.name));
      }
      return (data ?? []).map((item) => {
        const p = pmap.get(item.user_id);
        const fallbackCompanyId = memberCompany.get(item.user_id);
        return {
          ...item,
          user_email: p?.email,
          user_name: p?.display_name,
          company_name: item.company_id
            ? cmap.get(item.company_id)
            : fallbackCompanyId
              ? cmap.get(fallbackCompanyId)
              : undefined,
        } as FeedbackItem;
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: (e: any) => toast.error("Failed to update: " + e.message),
  });

  const filtered = useMemo(() => {
    if (!feedback) return [];
    const cutoff = (() => {
      if (dateRange === "all") return null;
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      return new Date(Date.now() - days * 86400000);
    })();
    return feedback.filter((f) => {
      const sl = search.toLowerCase();
      const matchesSearch = !search ||
        f.message.toLowerCase().includes(sl) ||
        f.user_name?.toLowerCase().includes(sl) ||
        f.user_email?.toLowerCase().includes(sl) ||
        f.company_name?.toLowerCase().includes(sl);
      const cat = f.category ?? f.type ?? "general";
      const matchesCat = categoryFilter === "all" || cat === categoryFilter;
      const matchesStatus = statusFilter === "all" || (f.status ?? "new") === statusFilter;
      const matchesRating = ratingFilter === "all" || String(f.rating ?? "") === ratingFilter;
      const matchesDate = !cutoff || new Date(f.created_at) >= cutoff;
      return matchesSearch && matchesCat && matchesStatus && matchesRating && matchesDate;
    });
  }, [feedback, search, categoryFilter, statusFilter, ratingFilter, dateRange]);

  const stats = useMemo(() => {
    const list = feedback ?? [];
    const ratings = list.map((f) => f.rating).filter((r): r is number => !!r);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const open = list.filter((f) => (f.status ?? "new") !== "done").length;
    return { total: list.length, avgRating, open };
  }, [feedback]);

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>Total Feedback</CardDescription></CardHeader><CardContent><div className="text-2xl font-semibold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Avg Rating</CardDescription></CardHeader><CardContent><div className="text-2xl font-semibold flex items-center gap-2">{stats.avgRating ? stats.avgRating.toFixed(1) : "—"}<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" /></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Open Items</CardDescription></CardHeader><CardContent><div className="text-2xl font-semibold">{stats.open}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search feedback..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-[120px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="Rating" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            {[5, 4, 3, 2, 1].map((r) => <SelectItem key={r} value={String(r)}>{r} stars</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || categoryFilter !== "all" || statusFilter !== "all" || ratingFilter !== "all" || dateRange !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); setRatingFilter("all"); setDateRange("all"); }}>
            <X className="h-4 w-4 mr-1" />Clear
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[160px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{feedback?.length ? "No feedback matches your filters." : "No feedback submitted yet."}</TableCell></TableRow>
            ) : filtered.map((item) => {
              const cat = item.category ?? item.type ?? "general";
              const status = item.status ?? "new";
              return (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm">{format(new Date(item.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{item.user_name || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">{item.user_email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.company_name || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><StarRating value={item.rating} /></TableCell>
                  <TableCell>
                    <Badge variant={cat === "bug" ? "destructive" : cat === "feature" ? "secondary" : "outline"} className="gap-1">
                      {cat === "bug" ? <Bug className="h-3 w-3" /> : cat === "feature" ? <Lightbulb className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                      {CATEGORY_LABEL[cat]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {item.title && <div className="font-medium text-sm">{item.title}</div>}
                    <p className="whitespace-pre-wrap break-words line-clamp-2 text-sm text-muted-foreground">{item.message}</p>
                  </TableCell>
                  <TableCell>
                    <Select value={status} onValueChange={(v) => updateStatus.mutate({ id: item.id, status: v })}>
                      <SelectTrigger className="w-[140px] h-8">
                        <Badge variant={STATUS_VARIANT[status]} className="text-xs">{STATUS_LABEL[status]}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}