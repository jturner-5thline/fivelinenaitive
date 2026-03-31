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
  PERMISSIONS_ADMINS,
  type DashboardTabKey,
  type TabPermissions,
  type PermissionUser,
} from '@/hooks/useFPATabPermissions';

interface FPAPermissionsTabProps {
  permissions: TabPermissions;
  onChange: (perms: TabPermissions) => void;
  currentEmail: string;
  companyUsers: PermissionUser[];
}

function userDisplayLabel(u: PermissionUser) {
  if (u.firstName || u.lastName) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ');
  }
  return u.email;
}

function userColumnLabel(u: PermissionUser) {
  if (u.firstName || u.lastName) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ');
  }
  return u.email.split('@')[0];
}

export function FPAPermissionsTab({ permissions, onChange, currentEmail, companyUsers }: FPAPermissionsTabProps) {
  const [cloneSource, setCloneSource] = useState<string>('');
  const [cloneTarget, setCloneTarget] = useState<string>('');
  const isCloneAdmin = PERMISSIONS_ADMINS.includes(currentEmail);

  // Use all company users as columns; ensure current defaults are represented
  const users = companyUsers.length > 0 ? companyUsers : [];

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

  const findUser = (email: string) => users.find(u => u.email === email);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <Label className="text-xs font-medium">Per-User Tab Access</Label>
      </div>

      {users.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading team members…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Tab</th>
                {users.map(u => (
                  <th key={u.email} className="text-center py-2 px-2 font-medium text-muted-foreground min-w-[80px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="truncate max-w-[100px]" title={u.email}>
                        {userColumnLabel(u)}
                      </span>
                      {PERMISSIONS_ADMINS.includes(u.email) && (
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
                  {users.map(u => {
                    const userTabs = permissions[u.email] ?? [...ALL_DASHBOARD_TABS];
                    const checked = userTabs.includes(tab);
                    return (
                      <td key={u.email} className="text-center py-2 px-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTab(u.email, tab)}
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
      )}

      {/* Clone Permissions */}
      {isCloneAdmin && users.length > 0 && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Copy className="h-3 w-3" />
            Clone permissions from user
          </Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={cloneSource} onValueChange={setCloneSource}>
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue placeholder="Source user" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.email} value={u.email} className="text-xs">
                    {userDisplayLabel(u)} <span className="text-muted-foreground ml-1">({u.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">→</span>
            <Select value={cloneTarget} onValueChange={setCloneTarget}>
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue placeholder="Target user" />
              </SelectTrigger>
              <SelectContent>
                {users.filter(u => u.email !== cloneSource).map(u => (
                  <SelectItem key={u.email} value={u.email} className="text-xs">
                    {userDisplayLabel(u)} <span className="text-muted-foreground ml-1">({u.email})</span>
                  </SelectItem>
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
