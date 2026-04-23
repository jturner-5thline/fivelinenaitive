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

const SYNC_SCOPE_GROUPS = [
  {
    label: 'Core',
    items: [
      { key: 'customers', label: 'Customers' },
      { key: 'invoices', label: 'Invoices' },
      { key: 'payments', label: 'Payments' },
    ],
  },
  {
    label: 'Accounts & Vendors',
    items: [
      { key: 'accounts', label: 'Chart of Accounts' },
      { key: 'vendors', label: 'Vendors' },
    ],
  },
  {
    label: 'Expenses & Payables',
    items: [
      { key: 'expenses', label: 'Expenses' },
      { key: 'bills', label: 'Bills' },
      { key: 'purchase_orders', label: 'Purchase Orders' },
    ],
  },
  {
    label: 'Other Transactions',
    items: [
      { key: 'journal_entries', label: 'Journal Entries' },
      { key: 'estimates', label: 'Estimates' },
      { key: 'credit_memos', label: 'Credit Memos' },
      { key: 'bank_deposits', label: 'Bank Deposits' },
      { key: 'bank_transfers', label: 'Bank Transfers' },
    ],
  },
  {
    label: 'Financial Reports',
    items: [
      { key: 'profit_and_loss', label: 'Profit & Loss' },
      { key: 'balance_sheet', label: 'Balance Sheet' },
      { key: 'ar_aging', label: 'AR Aging' },
      { key: 'ap_aging', label: 'AP Aging' },
    ],
  },
];

const ALL_SCOPE_KEYS = SYNC_SCOPE_GROUPS.flatMap(g => g.items.map(i => i.key));

function getDefaultSyncScope(): Record<string, boolean> {
  const scope: Record<string, boolean> = {};
  ALL_SCOPE_KEYS.forEach(k => { scope[k] = true; });
  return scope;
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

  const [syncScope, setSyncScope] = useState<Record<string, boolean>>(getDefaultSyncScope);

  const enabledScopes = ALL_SCOPE_KEYS.filter(k => syncScope[k]);
  const allChecked = enabledScopes.length === ALL_SCOPE_KEYS.length;
  const noneChecked = enabledScopes.length === 0;

  const handleToggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    ALL_SCOPE_KEYS.forEach(k => { next[k] = checked; });
    setSyncScope(next);
  };

  const handleSync = (realmId?: string) => {
    sync.mutate({ realmId: realmId || selectedRealmId || '', scopes: enabledScopes });
  };

  const handleSyncAll = () => {
    connections.forEach((c) => sync.mutate({ realmId: c.realmId, scopes: enabledScopes }));
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
                <Button variant="outline" size="sm" onClick={() => handleSync()} disabled={sync.isPending || noneChecked}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sync.isPending ? 'animate-spin' : ''}`} />
                  Sync Selected
                </Button>
                <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={sync.isPending || noneChecked}>
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
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Sync Scope</h4>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="qb-scope-all"
                    checked={allChecked}
                    onCheckedChange={(v) => handleToggleAll(!!v)}
                  />
                  <Label htmlFor="qb-scope-all" className="text-xs text-muted-foreground">Select All</Label>
                </div>
              </div>

              <div className="space-y-4">
                {SYNC_SCOPE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.label}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {group.items.map((item) => (
                        <div key={item.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`qb-scope-${item.key}`}
                            checked={!!syncScope[item.key]}
                            onCheckedChange={(v) => setSyncScope((prev) => ({ ...prev, [item.key]: !!v }))}
                          />
                          <Label htmlFor={`qb-scope-${item.key}`} className="text-sm">{item.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground mt-2">
                {enabledScopes.length} of {ALL_SCOPE_KEYS.length} data types selected
              </p>
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
                          <Badge variant={h.status === 'completed' || h.status === 'success' ? 'default' : h.status === 'partial' ? 'secondary' : 'destructive'} className="text-[10px]">
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
                <strong>Data Usage:</strong> naitive uses your QuickBooks data to display financial context on deal and company profiles, and to power configurable metrics dashboards. To create or edit transactions, open QuickBooks directly.
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
