import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useQuickBooksStatus,
  useQuickBooksConnect,
  useQuickBooksDisconnect,
  useQuickBooksSync,
  useQuickBooksSyncHistory,
} from '@/hooks/useQuickBooks';
import { Building2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface QuickBooksSyncSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickBooksSyncSettingsModal({ open, onClose }: QuickBooksSyncSettingsModalProps) {
  const { data: status } = useQuickBooksStatus();
  const connect = useQuickBooksConnect();
  const sync = useQuickBooksSync();

  const connections = status?.connections || [];
  const [selectedRealmId, setSelectedRealmId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (connections.length > 0 && !selectedRealmId) {
      setSelectedRealmId(connections[0].realmId);
    }
  }, [connections, selectedRealmId]);

  const { data: syncHistory = [] } = useQuickBooksSyncHistory(selectedRealmId);

  const [syncScope, setSyncScope] = useState({
    customers: true,
    invoices: true,
    payments: true,
  });

  const handleSync = (realmId?: string) => {
    sync.mutate({ realmId: realmId || selectedRealmId || '' });
  };

  const handleSyncAll = () => {
    connections.forEach((c) => sync.mutate({ realmId: c.realmId }));
    toast.success('Syncing all companies...');
  };

  const handleAddCompany = () => {
    connect.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>QuickBooks Sync Settings</DialogTitle>
          <DialogDescription>
            Manage connected QuickBooks companies and sync preferences.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 pb-4">
            {/* Connected Companies */}
            <div>
              <h4 className="text-sm font-medium mb-3">Connected Companies</h4>
              {connections.length > 0 && (
                <div className="space-y-2 mb-3">
                  <Select value={selectedRealmId} onValueChange={setSelectedRealmId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((c) => (
                        <SelectItem key={c.realmId} value={c.realmId}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5" />
                            {c.companyName || c.realmId}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleSync()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Sync
                </Button>
                <Button variant="outline" size="sm" onClick={handleSyncAll}>
                  Sync All Companies
                </Button>
                <Button variant="outline" size="sm" onClick={handleAddCompany}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Company
                </Button>
              </div>
            </div>

            <Separator />

            {/* Sync Scope */}
            <div>
              <h4 className="text-sm font-medium mb-3">Sync Scope</h4>
              <div className="space-y-2">
                {Object.entries(syncScope).map(([key, checked]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`qb-scope-${key}`}
                      checked={checked}
                      onCheckedChange={(v) => setSyncScope((prev) => ({ ...prev, [key]: !!v }))}
                    />
                    <Label htmlFor={`qb-scope-${key}`} className="text-sm capitalize">{key}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Sync History */}
            <div>
              <h4 className="text-sm font-medium mb-3">Sync History</h4>
              {syncHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Started</TableHead>
                      <TableHead className="text-xs">Completed</TableHead>
                      <TableHead className="text-xs">Records</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncHistory.slice(0, 10).map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs capitalize">{h.sync_type}</TableCell>
                        <TableCell className="text-xs">{format(new Date(h.started_at), 'MMM d, HH:mm')}</TableCell>
                        <TableCell className="text-xs">{h.completed_at ? format(new Date(h.completed_at), 'HH:mm') : '—'}</TableCell>
                        <TableCell className="text-xs">{h.records_synced ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={h.status === 'completed' ? 'default' : 'destructive'} className="text-[10px]">
                            {h.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-xs text-muted-foreground">No sync history yet.</p>
              )}
            </div>

            <Separator />

            {/* Data Usage Note */}
            <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                <strong>Data Usage:</strong> nAItive uses your QuickBooks data to display financial context on deal and company profiles. To create or edit transactions, open QuickBooks directly.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
