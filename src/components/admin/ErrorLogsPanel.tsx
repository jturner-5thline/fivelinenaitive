import { useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, RefreshCw, AlertCircle, Search, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useErrorLogs, useResolveErrorLog, ErrorLog } from "@/hooks/useAdminConfig";
import { EventDrawer, eventRowClass } from "./event-table/EventDrawer";

export const ErrorLogsPanel = () => {
  const { data: logs, isLoading, refetch } = useErrorLogs();
  const resolveError = useResolveErrorLog();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7d");
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);

  const errorTypes = useMemo(
    () => Array.from(new Set((logs ?? []).map((l) => l.error_type))).sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    const cutoff = (() => {
      if (dateRange === "all") return null;
      const days = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    })();
    return logs.filter((log) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        log.error_type.toLowerCase().includes(searchLower) ||
        log.error_message.toLowerCase().includes(searchLower) ||
        log.page_url?.toLowerCase().includes(searchLower) ||
        log.feature?.toLowerCase().includes(searchLower);
      const matchesStatus = statusFilter === "all" || (log.status ?? "open") === statusFilter;
      const matchesType = typeFilter === "all" || log.error_type === typeFilter;
      const matchesDate = !cutoff || new Date(log.created_at) >= cutoff;
      return matchesSearch && matchesStatus && matchesType && matchesDate;
    });
  }, [logs, search, statusFilter, typeFilter, dateRange]);

  // Group errors by type for summary
  const errorGroups = logs?.reduce((acc, log) => {
    acc[log.error_type] = (acc[log.error_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleResolve = async (id: string) => {
    try {
      await resolveError.mutateAsync(id);
      toast.success("Error marked resolved");
    } catch {
      toast.error("Failed to mark resolved");
    }
  };

  const exportCsv = () => {
    const rows = filteredLogs ?? [];
    const header = ["Timestamp", "Error Type", "Message", "User", "Feature", "Status", "Page"];
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.created_at, r.error_type, r.error_message, r.user_id ?? "", r.feature ?? "", r.status ?? "open", r.page_url ?? ""]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `error-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search errors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Error type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {errorTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            Export Errors
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <EventDrawer
        open={!!selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
        icon={<AlertCircle className="h-4 w-4" />}
        title={selectedLog?.error_type ?? "Error"}
        subtitle={selectedLog?.error_message}
        timestamp={selectedLog?.created_at}
        badges={
          selectedLog
            ? [
                { label: selectedLog.error_type, variant: "destructive" },
                {
                  label: (selectedLog.status ?? "open") === "resolved" ? "Resolved" : "Open",
                  variant:
                    (selectedLog.status ?? "open") === "resolved" ? "secondary" : "destructive",
                },
              ]
            : []
        }
        fields={
          selectedLog
            ? [
                { label: "Feature", value: selectedLog.feature || "—" },
                { label: "User ID", value: selectedLog.user_id || "—", mono: true },
                { label: "Page", value: selectedLog.page_url || "—", mono: true },
              ]
            : []
        }
      >
        {selectedLog && (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Error message
              </p>
              <p className="text-sm bg-destructive/10 text-destructive p-3 rounded font-mono whitespace-pre-wrap break-words">
                {selectedLog.error_message}
              </p>
            </div>
            {selectedLog.stack_trace && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Stack trace
                </p>
                <pre className="text-[11px] font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-words">
                  {selectedLog.stack_trace}
                </pre>
              </div>
            )}
            {selectedLog.metadata && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Metadata
                </p>
                <pre className="text-[11px] font-mono bg-muted p-3 rounded overflow-x-auto">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
        {selectedLog && (selectedLog.status ?? "open") !== "resolved" ? (
          // footer slot rendered via prop below
          null
        ) : null}
      </EventDrawer>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Error Type</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Feature</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[180px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLogs?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No errors logged in the selected period.
              </TableCell>
            </TableRow>
          ) : (
            filteredLogs?.map((log) => (
              <TableRow
                key={log.id}
                className={eventRowClass}
                onClick={() => setSelectedLog(log)}
              >
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(log.created_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell>
                  <Badge variant="destructive">{log.error_type}</Badge>
                </TableCell>
                <TableCell className="max-w-[300px] truncate text-sm">
                  {log.error_message}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs font-mono max-w-[140px] truncate">
                  {log.user_id || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {log.feature || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={(log.status ?? "open") === "resolved" ? "secondary" : "destructive"}>
                    {(log.status ?? "open") === "resolved" ? "Resolved" : "Open"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLog(log);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(log.status ?? "open") !== "resolved" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resolveError.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolve(log.id);
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
