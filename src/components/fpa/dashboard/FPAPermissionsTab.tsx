import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, ShieldCheck, Layers, LayoutDashboard } from 'lucide-react';
import {
  ALL_DASHBOARD_TABS,
  TAB_DISPLAY_NAMES,
  ALL_MODULE_TABS,
  MODULE_TAB_DISPLAY_NAMES,
  LOCKED_MODULE_TABS,
  PERMISSIONS_ADMINS,
  type DashboardTabKey,
  type ModuleTabKey,
  type TabPermissions,
  type ModuleTabPermissions,
  type PermissionUser,
} from '@/hooks/useFPATabPermissions';

interface FPAPermissionsTabProps {
  permissions: TabPermissions;
  modulePermissions: ModuleTabPermissions;
  onChange: (perms: TabPermissions) => void;
  onModuleChange: (perms: ModuleTabPermissions) => void;
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

export function FPAPermissionsTab({ permissions, modulePermissions, onChange, onModuleChange, currentEmail, companyUsers }: FPAPermissionsTabProps) {
  const [cloneSource, setCloneSource] = useState<string>('');
  const [cloneTarget, setCloneTarget] = useState<string>('');
  const isCloneAdmin = PERMISSIONS_ADMINS.includes(currentEmail);

  const users = companyUsers.length > 0 ? companyUsers : [];

  const toggleDashboardTab = (email: string, tab: DashboardTabKey) => {
    const current = permissions[email] ?? [...ALL_DASHBOARD_TABS];
    const next = current.includes(tab)
      ? current.filter(t => t !== tab)
      : [...current, tab];
    onChange({ ...permissions, [email]: next });
  };

  const toggleModuleTab = (email: string, tab: ModuleTabKey) => {
    // Can't toggle locked tabs
    if (LOCKED_MODULE_TABS.includes(tab)) return;
    const current = modulePermissions[email] ?? [...ALL_MODULE_TABS];
    const next = current.includes(tab)
      ? current.filter(t => t !== tab)
      : [...current, tab];
    onModuleChange({ ...modulePermissions, [email]: next });
  };

  const handleClone = () => {
    if (!cloneSource || !cloneTarget || cloneSource === cloneTarget) return;
    const sourceTabs = permissions[cloneSource] ?? [...ALL_DASHBOARD_TABS];
    const sourceModuleTabs = modulePermissions[cloneSource] ?? [...ALL_MODULE_TABS];
    onChange({ ...permissions, [cloneTarget]: [...sourceTabs] });
    onModuleChange({ ...modulePermissions, [cloneTarget]: [...sourceModuleTabs] });
    setCloneSource('');
    setCloneTarget('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <Label className="text-xs font-medium">Per-User Tab Access</Label>
      </div>

      {users.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading team members…</p>
      ) : (
        <>
          {/* Module-level tabs */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Finance Module Tabs</Label>
            </div>
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
                  {ALL_MODULE_TABS.map(tab => {
                    const isLocked = LOCKED_MODULE_TABS.includes(tab);
                    return (
                      <tr key={tab} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 pr-4 text-muted-foreground">
                          {MODULE_TAB_DISPLAY_NAMES[tab]}
                          {isLocked && (
                            <Badge variant="secondary" className="ml-1.5 text-[8px] px-1 py-0">Locked</Badge>
                          )}
                        </td>
                        {users.map(u => {
                          const userTabs = modulePermissions[u.email] ?? [...ALL_MODULE_TABS];
                          const checked = userTabs.includes(tab);
                          return (
                            <td key={u.email} className="text-center py-2 px-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleModuleTab(u.email, tab)}
                                disabled={isLocked}
                                className="mx-auto"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Dashboard sub-tabs */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Dashboard Sub-Tabs</Label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Tab</th>
                    {users.map(u => (
                      <th key={u.email} className="text-center py-2 px-2 font-medium text-muted-foreground min-w-[80px]">
                        <span className="truncate max-w-[100px]" title={u.email}>
                          {userColumnLabel(u)}
                        </span>
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
                              onCheckedChange={() => toggleDashboardTab(u.email, tab)}
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
          </div>
        </>
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
