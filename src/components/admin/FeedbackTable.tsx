import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bug, Lightbulb } from "lucide-react";
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

interface FeedbackItem {
  id: string;
  user_id: string;
  title: string | null;
  message: string;
  type: string | null;
  page_url: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export function FeedbackTable() {
  const { data: feedback, isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      // Fetch feedback with user info
      const { data: feedbackData, error: feedbackError } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });

      if (feedbackError) throw feedbackError;

      // Fetch profiles for user info
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!feedback?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No feedback submitted yet.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Page</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedback.map((item) => (
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
  );
}
