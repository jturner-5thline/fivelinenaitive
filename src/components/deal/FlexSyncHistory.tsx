import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, XCircle, Clock, RefreshCw, ExternalLink, CloudOff } from "lucide-react";
import { useFlexSyncHistory, useLatestFlexSync } from "@/hooks/useFlexSyncHistory";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FlexSyncHistoryProps {
  dealId: string;
}

export function FlexSyncStatusBadge({ dealId }: { dealId: string }) {
  const { data: latestSync, isLoading } = useLatestFlexSync(dealId);

  if (isLoading) {
    return <Skeleton className="h-5 w-24" />;
  }

  if (!latestSync) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Clock className="h-3 w-3 mr-1" />
        Never synced
      </Badge>
    );
  }

  const timeAgo = formatDistanceToNow(new Date(latestSync.created_at), { addSuffix: true });

  if (latestSync.status === "unpublished") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-muted-foreground">
              <CloudOff className="h-3 w-3 mr-1" />
              Unpublished {timeAgo}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Unpublished: {format(new Date(latestSync.created_at), "PPp")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (latestSync.status === "success") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Published {timeAgo}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Last synced: {format(new Date(latestSync.created_at), "PPp")}</p>
            {latestSync.flex_deal_id && (
              <p className="text-xs text-muted-foreground">FLEx ID: {latestSync.flex_deal_id}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Sync failed {timeAgo}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Failed: {format(new Date(latestSync.created_at), "PPp")}</p>
          {latestSync.error_message && (
            <p className="text-xs text-destructive">{latestSync.error_message}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FlexSyncHistory({ dealId }: FlexSyncHistoryProps) {
  const { data: history, isLoading } = useFlexSyncHistory(dealId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            FLEx Sync History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            FLEx Sync History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No sync history yet. Push this deal to FLEx to start tracking.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          FLEx Sync History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[200px]">
          <div className="divide-y">
            {history.map((record) => (
              <div key={record.id} className="flex items-start gap-3 p-4">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={record.synced_by_profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {record.synced_by_profile?.display_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {record.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : record.status === "unpublished" ? (
                      <CloudOff className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">
                      {record.synced_by_profile?.display_name || "Unknown user"}
                      {record.status === "unpublished" && " unpublished"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(record.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    {record.flex_deal_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs cursor-help">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              {record.flex_deal_id.slice(0, 8)}...
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>FLEx Deal ID: {record.flex_deal_id}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {record.error_message && (
                    <p className="text-xs text-destructive mt-1">{record.error_message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
