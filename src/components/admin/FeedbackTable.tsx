import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bug, Lightbulb, Image, X, Search, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FeedbackItem {
  id: string;
  user_id: string;
  title: string | null;
  message: string;
  type: string | null;
  page_url: string | null;
  screenshot_url: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export function FeedbackTable() {
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: feedback, isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data: feedbackData, error: feedbackError } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });

      if (feedbackError) throw feedbackError;

      const userIds = [...new Set(feedbackData?.map((f) => f.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(
        profiles?.map((p) => [p.user_id, p]) || []
      );

      return feedbackData?.map((item) => {
        const profile = profileMap.get(item.user_id);
        return {
          ...item,
          user_email: profile?.email,
          user_name: profile?.display_name,
        };
      }) as FeedbackItem[];
    },
  });

  const getScreenshotUrl = (path: string) => {
    const { data } = supabase.storage
      .from("feedback-screenshots")
      .getPublicUrl(path);
    return data.publicUrl;
  };

  const filteredFeedback = useMemo(() => {
    if (!feedback) return [];
    
    return feedback.filter((item) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        item.title?.toLowerCase().includes(searchLower) ||
        item.message.toLowerCase().includes(searchLower) ||
        item.user_name?.toLowerCase().includes(searchLower) ||
        item.user_email?.toLowerCase().includes(searchLower) ||
        item.page_url?.toLowerCase().includes(searchLower);

      const matchesType = typeFilter === "all" || item.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [feedback, search, typeFilter]);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
  };

  const hasActiveFilters = search || typeFilter !== "all";

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature">Feature</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {!filteredFeedback.length ? (
        <div className="text-center py-8 text-muted-foreground">
          {feedback?.length ? "No feedback matches your filters." : "No feedback submitted yet."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Screenshot</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFeedback.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.type === 'bug' ? (
                      <Badge variant="destructive" className="gap-1">
                        <Bug className="h-3 w-3" />
                        Bug
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Lightbulb className="h-3 w-3" />
                        Feature
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.title || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="whitespace-pre-wrap break-words line-clamp-2">
                      {item.message}
                    </p>
                  </TableCell>
                  <TableCell>
                    {item.screenshot_url ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 p-1 h-auto"
                        onClick={() => setSelectedScreenshot(getScreenshotUrl(item.screenshot_url!))}
                      >
                        <Image className="h-4 w-4" />
                        <img
                          src={getScreenshotUrl(item.screenshot_url)}
                          alt="Screenshot thumbnail"
                          className="h-8 w-12 object-cover rounded border"
                        />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {item.user_name || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.user_email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.page_url ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {item.page_url}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedScreenshot} onOpenChange={() => setSelectedScreenshot(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Screenshot Preview</DialogTitle>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background"
              onClick={() => setSelectedScreenshot(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            {selectedScreenshot && (
              <img
                src={selectedScreenshot}
                alt="Feedback screenshot"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
