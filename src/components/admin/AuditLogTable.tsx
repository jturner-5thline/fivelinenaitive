import { formatDistanceToNow } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  UserX, Building2, Ban, CheckCircle, Shield, UserPlus, Trash2
} from "lucide-react";
import { useAuditLogs } from "@/hooks/useAdminData";

const actionConfig: Record<string, { icon: React.ElementType; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  user_deleted: { icon: UserX, label: "User Deleted", variant: "destructive" },
  company_deleted: { icon: Trash2, label: "Company Deleted", variant: "destructive" },
  company_suspended: { icon: Ban, label: "Company Suspended", variant: "destructive" },
  company_unsuspended: { icon: CheckCircle, label: "Company Unsuspended", variant: "default" },
  role_added: { icon: UserPlus, label: "Role Added", variant: "secondary" },
  role_removed: { icon: Shield, label: "Role Removed", variant: "secondary" },
};

export const AuditLogTable = () => {
  const { data: logs, isLoading } = useAuditLogs(50);

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
          {logs.map((log) => {
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
          })}
        </TableBody>
      </Table>
    </div>
  );
};