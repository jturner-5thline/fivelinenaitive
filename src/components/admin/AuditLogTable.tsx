import { useState, useMemo } from "react";
import { formatDistanceToNow, format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  UserX, Building2, Ban, CheckCircle, Shield, UserPlus, Trash2, Search, X, CalendarIcon, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuditLogs } from "@/hooks/useAdminData";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const actionConfig: Record<string, { icon: React.ElementType; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  user_deleted: { icon: UserX, label: "User Deleted", variant: "destructive" },
  company_deleted: { icon: Trash2, label: "Company Deleted", variant: "destructive" },
  company_suspended: { icon: Ban, label: "Company Suspended", variant: "destructive" },
  company_unsuspended: { icon: CheckCircle, label: "Company Unsuspended", variant: "default" },
  role_added: { icon: UserPlus, label: "Role Added", variant: "secondary" },
  role_removed: { icon: Shield, label: "Role Removed", variant: "secondary" },
};

const actionOptions = [
  { value: "all", label: "All Actions" },
  { value: "user_deleted", label: "User Deleted" },
  { value: "company_deleted", label: "Company Deleted" },
  { value: "company_suspended", label: "Company Suspended" },
  { value: "company_unsuspended", label: "Company Unsuspended" },
  { value: "role_added", label: "Role Added" },
  { value: "role_removed", label: "Role Removed" },
];

const targetOptions = [
  { value: "all", label: "All Targets" },
  { value: "user", label: "Users" },
  { value: "company", label: "Companies" },
];

export const AuditLogTable = () => {
  const { data: logs, isLoading } = useAuditLogs(500);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    
    return logs.filter((log) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        log.target_name?.toLowerCase().includes(searchLower) ||
        log.admin_name?.toLowerCase().includes(searchLower) ||
        log.admin_email?.toLowerCase().includes(searchLower) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchLower));
      
      // Action type filter
      const matchesAction = actionFilter === "all" || log.action_type === actionFilter;
      
      // Target type filter
      const matchesTarget = targetFilter === "all" || log.target_type === targetFilter;

      // Date range filter
      const logDate = new Date(log.created_at);
      let matchesDateRange = true;
      if (startDate && endDate) {
        matchesDateRange = isWithinInterval(logDate, { 
          start: startOfDay(startDate), 
          end: endOfDay(endDate) 
        });
      } else if (startDate) {
        matchesDateRange = logDate >= startOfDay(startDate);
      } else if (endDate) {
        matchesDateRange = logDate <= endOfDay(endDate);
      }
      
      return matchesSearch && matchesAction && matchesTarget && matchesDateRange;
    });
  }, [logs, search, actionFilter, targetFilter, startDate, endDate]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const hasActiveFilters = search || actionFilter !== "all" || targetFilter !== "all" || startDate || endDate;

  const clearFilters = () => {
    setSearch("");
    setActionFilter("all");
    setTargetFilter("all");
    setStartDate(undefined);
    setEndDate(undefined);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p>No audit log entries yet</p>
        <p className="text-sm">Admin actions will be recorded here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, admin, or details..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); handleFilterChange(); }}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetFilter} onValueChange={(v) => { setTargetFilter(v); handleFilterChange(); }}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Target type" />
            </SelectTrigger>
            <SelectContent>
              {targetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">From:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[150px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => { setStartDate(date); handleFilterChange(); }}
                  disabled={(date) => (endDate ? date > endDate : false) || date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">To:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[150px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => { setEndDate(date); handleFilterChange(); }}
                  disabled={(date) => (startDate ? date < startDate : false) || date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Results count and page size */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {startIndex + 1}-{Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} entries
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No matching entries found
                </TableCell>
              </TableRow>
            ) : (
              paginatedLogs.map((log) => {
                const config = actionConfig[log.action_type] || { 
                  icon: Shield, 
                  label: log.action_type.replace(/_/g, " "), 
                  variant: "secondary" as const
                };
                const Icon = config.icon;

                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={config.variant} className="flex items-center gap-1.5 w-fit">
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {log.target_type === "company" ? (
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <UserX className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{log.target_name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {log.admin_name?.[0] || log.admin_email?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{log.admin_name || log.admin_email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                      {log.details && Object.keys(log.details).length > 0 ? (
                        <span title={JSON.stringify(log.details, null, 2)}>
                          {Object.entries(log.details)
                            .filter(([, v]) => v !== null)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ") || "-"}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};