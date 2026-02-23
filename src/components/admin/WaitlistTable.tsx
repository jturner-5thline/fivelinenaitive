import { useState } from "react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, Mail, CheckCircle, CheckCheck } from "lucide-react";
import { useWaitlist, useDeleteWaitlistEntry, useApproveWaitlistEntry, useBulkApproveWaitlist } from "@/hooks/useAdminData";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const WaitlistTable = () => {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: waitlist, isLoading } = useWaitlist();
  const deleteEntry = useDeleteWaitlistEntry();
  const approveEntry = useApproveWaitlistEntry();
  const bulkApprove = useBulkApproveWaitlist();

  const filteredWaitlist = waitlist?.filter(
    (w) =>
      w.email?.toLowerCase().includes(search.toLowerCase()) ||
      w.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.company?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingEntries = filteredWaitlist?.filter((w) => !w.approved_at) || [];
  const selectedPendingIds = [...selectedIds].filter((id) =>
    pendingEntries.some((e) => e.id === id)
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPendingIds.length === pendingEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingEntries.map((e) => e.id)));
    }
  };

  const handleBulkApprove = () => {
    if (selectedPendingIds.length > 0) {
      bulkApprove.mutate(selectedPendingIds, {
        onSuccess: () => setSelectedIds(new Set()),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Signed Up</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search waitlist..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredWaitlist?.length || 0} entries
        </div>
        {selectedPendingIds.length > 0 && (
          <Button
            size="sm"
            onClick={handleBulkApprove}
            disabled={bulkApprove.isPending}
            className="gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Approve {selectedPendingIds.length} selected
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {pendingEntries.length > 0 && (
                  <Checkbox
                    checked={selectedPendingIds.length === pendingEntries.length && pendingEntries.length > 0}
                    onCheckedChange={toggleAll}
                  />
                )}
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Signed Up</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWaitlist?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No waitlist entries found
                </TableCell>
              </TableRow>
            ) : (
              filteredWaitlist?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {!entry.approved_at && (
                      <Checkbox
                        checked={selectedIds.has(entry.id)}
                        onCheckedChange={() => toggleSelect(entry.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {entry.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.name || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.company || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </TableCell>
                  <TableCell>
                    {entry.approved_at ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Approved
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!entry.approved_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => approveEntry.mutate(entry.id)}
                          disabled={approveEntry.isPending}
                          className="text-primary hover:text-primary"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete waitlist entry?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove {entry.email} from the waitlist.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteEntry.mutate(entry.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
