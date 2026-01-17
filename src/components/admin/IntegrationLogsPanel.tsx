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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { useIntegrationLogs, IntegrationLog } from "@/hooks/useAdminConfig";
import { useQueryClient } from "@tanstack/react-query";

const statusConfig: Record<IntegrationLog["status"], { icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { icon: Clock, variant: "outline" },
  success: { icon: CheckCircle, variant: "default" },
  failed: { icon: XCircle, variant: "destructive" },
  retrying: { icon: Loader2, variant: "secondary" },
};

export const IntegrationLogsPanel = () => {
  const [filter, setFilter] = useState<string>("all");
  const { data: logs, isLoading, refetch } = useIntegrationLogs();
  const queryClient = useQueryClient();
  const [selectedLog, setSelectedLog] = useState<IntegrationLog | null>(null);

  const filteredLogs = logs?.filter((log) => {
    if (filter === "all") return true;
    if (filter === "failed") return log.status === "failed";
    return log.integration_type === filter;
  });

  const integrationTypes = [...new Set(logs?.map((l) => l.integration_type) || [])];

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Integrations</SelectItem>
              <SelectItem value="failed">Failed Only</SelectItem>
              {integrationTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {filteredLogs?.length || 0} logs
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>{" "}
                <span className="font-medium">{selectedLog?.integration_type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Event:</span>{" "}
                <span className="font-medium">{selectedLog?.event_type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge
                  variant={statusConfig[selectedLog?.status || "pending"].variant}
                  className="ml-1"
                >
                  {selectedLog?.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Retries:</span>{" "}
                <span className="font-medium">{selectedLog?.retry_count}</span>
              </div>
            </div>
            {selectedLog?.error_message && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Error Message:</span>
                <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                  {selectedLog.error_message}
                </p>
              </div>
            )}
            {selectedLog?.payload && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Payload:</span>
                <ScrollArea className="h-[150px] border rounded p-2">
                  <pre className="text-xs font-mono">
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}
            {selectedLog?.response && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Response:</span>
                <ScrollArea className="h-[150px] border rounded p-2">
                  <pre className="text-xs font-mono">
                    {JSON.stringify(selectedLog.response, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Integration</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Retries</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="w-[80px]">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLogs?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No integration logs found
              </TableCell>
            </TableRow>
          ) : (
            filteredLogs?.map((log) => {
              const config = statusConfig[log.status];
              const Icon = config.icon;
              return (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.integration_type}</TableCell>
                  <TableCell className="text-muted-foreground">{log.event_type}</TableCell>
                  <TableCell>
                    <Badge variant={config.variant} className="gap-1">
                      <Icon className={`h-3 w-3 ${log.status === "retrying" ? "animate-spin" : ""}`} />
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.retry_count > 0 && (
                      <Badge variant="outline">{log.retry_count}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
