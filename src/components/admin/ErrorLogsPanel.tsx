import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, RefreshCw, AlertCircle, Search } from "lucide-react";
import { useErrorLogs, ErrorLog } from "@/hooks/useAdminConfig";

export const ErrorLogsPanel = () => {
  const { data: logs, isLoading, refetch } = useErrorLogs();
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);

  const filteredLogs = logs?.filter((log) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      log.error_type.toLowerCase().includes(searchLower) ||
      log.error_message.toLowerCase().includes(searchLower) ||
      log.page_url?.toLowerCase().includes(searchLower)
    );
  });

  // Group errors by type for summary
  const errorGroups = logs?.reduce((acc, log) => {
    acc[log.error_type] = (acc[log.error_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Summary */}
      {errorGroups && Object.keys(errorGroups).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(errorGroups)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([type, count]) => (
              <Badge key={type} variant="outline" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {type}: {count}
              </Badge>
            ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="relative w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search errors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Error Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>{" "}
                  <Badge variant="destructive">{selectedLog?.error_type}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Time:</span>{" "}
                  <span className="font-medium">
                    {selectedLog && format(new Date(selectedLog.created_at), "MMM d, yyyy HH:mm:ss")}
                  </span>
                </div>
                {selectedLog?.page_url && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Page:</span>{" "}
                    <span className="font-mono text-xs">{selectedLog.page_url}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Error Message:</span>
                <p className="text-sm bg-destructive/10 text-destructive p-3 rounded font-mono">
                  {selectedLog?.error_message}
                </p>
              </div>
              {selectedLog?.stack_trace && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Stack Trace:</span>
                  <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.stack_trace}
                  </pre>
                </div>
              )}
              {selectedLog?.metadata && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Metadata:</span>
                  <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Error Type</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Page</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="w-[80px]">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLogs?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No error logs found
              </TableCell>
            </TableRow>
          ) : (
            filteredLogs?.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <Badge variant="destructive">{log.error_type}</Badge>
                </TableCell>
                <TableCell className="max-w-[300px] truncate text-sm">
                  {log.error_message}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs font-mono max-w-[150px] truncate">
                  {log.page_url || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(log.created_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
