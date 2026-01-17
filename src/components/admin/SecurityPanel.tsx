import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Shield, Ban, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  useIpAllowlist,
  useCreateIpAllowlistEntry,
  useDeleteIpAllowlistEntry,
  useBlockedIps,
  useUnblockIp,
} from "@/hooks/useAdminConfig";

export const SecurityPanel = () => {
  const { data: allowlist, isLoading: allowlistLoading } = useIpAllowlist();
  const { data: blockedIps, isLoading: blockedLoading } = useBlockedIps();
  const createEntry = useCreateIpAllowlistEntry();
  const deleteEntry = useDeleteIpAllowlistEntry();
  const unblockIp = useUnblockIp();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newIp, setNewIp] = useState({ ip_address: "", description: "" });

  const handleAddIp = async () => {
    if (!newIp.ip_address.trim()) {
      toast.error("IP address is required");
      return;
    }

    try {
      await createEntry.mutateAsync({
        ip_address: newIp.ip_address,
        description: newIp.description || undefined,
      });
      toast.success("IP added to allowlist");
      setIsAddOpen(false);
      setNewIp({ ip_address: "", description: "" });
    } catch (error) {
      toast.error("Failed to add IP");
    }
  };

  const handleDeleteIp = async (id: string) => {
    try {
      await deleteEntry.mutateAsync(id);
      toast.success("IP removed from allowlist");
    } catch (error) {
      toast.error("Failed to remove IP");
    }
  };

  const handleUnblock = async (id: string) => {
    try {
      await unblockIp.mutateAsync(id);
      toast.success("IP unblocked");
    } catch (error) {
      toast.error("Failed to unblock IP");
    }
  };

  if (allowlistLoading || blockedLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Blocked IPs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg">Blocked IPs</CardTitle>
            </div>
            <Badge variant="secondary">{blockedIps?.length || 0} blocked</Badge>
          </div>
          <CardDescription>
            IPs currently blocked due to rate limiting
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blockedIps?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No IPs are currently blocked
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Blocked Until</TableHead>
                  <TableHead>Request Count</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockedIps?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono">{entry.ip_address}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.path}</TableCell>
                    <TableCell>
                      {entry.blocked_until && format(new Date(entry.blocked_until), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">{entry.request_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnblock(entry.id)}
                      >
                        <Unlock className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* IP Allowlist */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle className="text-lg">IP Allowlist</CardTitle>
            </div>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add IP
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add IP to Allowlist</DialogTitle>
                  <DialogDescription>
                    Allowlisted IPs bypass rate limiting
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>IP Address</Label>
                    <Input
                      placeholder="e.g., 192.168.1.1 or 10.0.0.0/24"
                      value={newIp.ip_address}
                      onChange={(e) => setNewIp({ ...newIp, ip_address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Input
                      placeholder="e.g., Office network"
                      value={newIp.description}
                      onChange={(e) => setNewIp({ ...newIp, description: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddIp} disabled={createEntry.isPending}>
                    Add IP
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            IPs in this list bypass rate limiting restrictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allowlist?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No IPs in allowlist
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowlist?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono">{entry.ip_address}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(entry.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.is_active ? "default" : "secondary"}>
                        {entry.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove IP</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove this IP from the allowlist?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteIp(entry.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
