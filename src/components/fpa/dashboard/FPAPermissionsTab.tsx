import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Copy, ShieldCheck } from 'lucide-react';
import {
  ALL_DASHBOARD_TABS,
  TAB_DISPLAY_NAMES,
  MANAGED_USERS,
  PERMISSIONS_ADMINS,
  type DashboardTabKey,
  type TabPermissions,
} from '@/hooks/useFPATabPermissions';

interface FPAPermissionsTabProps {
  permissions: TabPermissions;
  onChange: (perms: TabPermissions) => void;
  currentEmail: string;
}

function userLabel(email: string) {
  return email.split('@')[0];
}

export function FPAPermissionsTab({ permissions, onChange, currentEmail }: FPAPermissionsTabProps) {
  const [cloneSource, setCloneSource] = useState<string>('');
  const [cloneTarget, setCloneTarget] = useState<string>('');
  const isCloneAdmin = PERMISSIONS_ADMINS.includes(currentEmail);

  const toggleTab = (email: string, tab: DashboardTabKey) => {
    const current = permissions[email] ?? [...ALL_DASHBOARD_TABS];
    const next = current.includes(tab)
      ? current.filter(t => t !== tab)
      : [...current, tab];
    onChange({ ...permissions, [email]: next });
  };

  const handleClone = () => {
    if (!cloneSource || !cloneTarget || cloneSource === cloneTarget) return;
    const sourceTabs = permissions[cloneSource] ?? [...ALL_DASHBOARD_TABS];
    onChange({ ...permissions, [cloneTarget]: [...sourceTabs] });
    setCloneSource('');
    setCloneTarget('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <Label className="text-xs font-medium">Per-User Tab Access</Label>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Tab</th>
              {MANAGED_USERS.map(email => (
                <th key={email} className="text-center py-2 px-2 font-medium text-muted-foreground min-w-[80px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{userLabel(email)}</span>
                    {PERMISSIONS_ADMINS.includes(email) && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0">Admin</Badge>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_DASHBOARD_TABS.map(tab => (
              <tr key={tab} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-4 text-muted-foreground">{TAB_DISPLAY_NAMES[tab]}</td>
                {MANAGED_USERS.map(email => {
                  const userTabs = permissions[email] ?? [...ALL_DASHBOARD_TABS];
                  const checked = userTabs.includes(tab);
                  return (
                    <td key={email} className="text-center py-2 px-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTab(email, tab)}
                        className="mx-auto"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Clone Permissions */}
      {isCloneAdmin && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Copy className="h-3 w-3" />
            Clone permissions from user
          </Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={cloneSource} onValueChange={setCloneSource}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Source user" />
              </SelectTrigger>
              <SelectContent>
                {MANAGED_USERS.map(e => (
                  <SelectItem key={e} value={e} className="text-xs">{userLabel(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">→</span>
            <Select value={cloneTarget} onValueChange={setCloneTarget}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Target user" />
              </SelectTrigger>
              <SelectContent>
                {MANAGED_USERS.filter(e => e !== cloneSource).map(e => (
                  <SelectItem key={e} value={e} className="text-xs">{userLabel(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={!cloneSource || !cloneTarget || cloneSource === cloneTarget}
              onClick={handleClone}
            >
              Clone
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
