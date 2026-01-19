import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Shield, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Plus,
  Search,
  User,
  Building2,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';

interface UserPermission {
  id: string;
  user_id: string;
  company_id: string | null;
  deals_scope: 'all' | 'team' | 'own' | 'none';
  lenders_scope: 'all' | 'team' | 'own' | 'none';
  analytics_scope: 'all' | 'team' | 'own' | 'none';
  reports_scope: 'all' | 'team' | 'own' | 'none';
  insights_scope: 'all' | 'team' | 'own' | 'none';
  can_export: boolean;
  can_bulk_edit: boolean;
  can_delete: boolean;
  can_view_financials: boolean;
  can_view_sensitive: boolean;
  assigned_deal_ids: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
}

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All Data', description: 'Can see all company data' },
  { value: 'team', label: 'Team Only', description: 'Can see assigned data only' },
  { value: 'own', label: 'Own Only', description: 'Can see only own data' },
  { value: 'none', label: 'No Access', description: 'Cannot access this data' },
];

const getScopeBadgeVariant = (scope: string) => {
  switch (scope) {
    case 'all': return 'default';
    case 'team': return 'secondary';
    case 'own': return 'outline';
    case 'none': return 'destructive';
    default: return 'outline';
  }
};

export function UserPermissionsPanel() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPermission, setEditingPermission] = useState<UserPermission | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Fetch all permissions
  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_data_permissions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as UserPermission[];
    },
  });

  // Fetch all users (profiles)
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['all-users-for-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .order('email');
      
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  // Create/update permission
  const saveMutation = useMutation({
    mutationFn: async (permission: Partial<UserPermission>) => {
      if (permission.id) {
        const { id, created_at, updated_at, ...updateData } = permission;
        const { error } = await supabase
          .from('user_data_permissions')
          .update(updateData as any)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { id, created_at, updated_at, ...insertData } = permission;
        const { error } = await supabase
          .from('user_data_permissions')
          .insert(insertData as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      setIsDialogOpen(false);
      setEditingPermission(null);
      toast.success('Permission saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save permission', { description: error.message });
    },
  });

  // Delete permission
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_data_permissions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      toast.success('Permission deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete permission', { description: error.message });
    },
  });

  const getUserEmail = (userId: string) => {
    const user = users?.find(u => u.id === userId);
    return user?.email || user?.display_name || userId.slice(0, 8);
  };

  const filteredPermissions = permissions?.filter(p => {
    const userEmail = getUserEmail(p.user_id).toLowerCase();
    return userEmail.includes(searchQuery.toLowerCase());
  });

  const handleEdit = (permission: UserPermission) => {
    setEditingPermission(permission);
    setSelectedUserId(permission.user_id);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingPermission(null);
    setSelectedUserId('');
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    const permission = editingPermission || {
      user_id: selectedUserId,
      deals_scope: 'own' as const,
      lenders_scope: 'all' as const,
      analytics_scope: 'own' as const,
      reports_scope: 'own' as const,
      insights_scope: 'own' as const,
      can_export: true,
      can_bulk_edit: true,
      can_delete: false,
      can_view_financials: true,
      can_view_sensitive: true,
    };

    if (!selectedUserId && !editingPermission) {
      toast.error('Please select a user');
      return;
    }

    saveMutation.mutate({
      ...permission,
      user_id: selectedUserId || editingPermission?.user_id,
    });
  };

  if (permissionsLoading || usersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Permission
        </Button>
      </div>

      <ScrollArea className="h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Deals</TableHead>
              <TableHead>Lenders</TableHead>
              <TableHead>Analytics</TableHead>
              <TableHead>Capabilities</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPermissions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No permissions configured. Add one to restrict user data access.
                </TableCell>
              </TableRow>
            ) : (
              filteredPermissions?.map((permission) => (
                <TableRow key={permission.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{getUserEmail(permission.user_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getScopeBadgeVariant(permission.deals_scope)}>
                      {permission.deals_scope}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getScopeBadgeVariant(permission.lenders_scope)}>
                      {permission.lenders_scope}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getScopeBadgeVariant(permission.analytics_scope)}>
                      {permission.analytics_scope}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {permission.can_export && (
                        <Badge variant="outline" className="text-xs">Export</Badge>
                      )}
                      {permission.can_delete && (
                        <Badge variant="destructive" className="text-xs">Delete</Badge>
                      )}
                      {!permission.can_view_financials && (
                        <Badge variant="secondary" className="text-xs">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Financials
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(permission)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => deleteMutation.mutate(permission.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {editingPermission ? 'Edit User Permissions' : 'Add User Permissions'}
            </DialogTitle>
            <DialogDescription>
              Configure what data this user can access across the platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* User Selection */}
            {!editingPermission && (
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email || user.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Scope Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deals Access</Label>
                <Select 
                  value={editingPermission?.deals_scope || 'own'}
                  onValueChange={(value) => setEditingPermission(prev => ({
                    ...prev!,
                    deals_scope: value as any,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Lenders Access</Label>
                <Select 
                  value={editingPermission?.lenders_scope || 'all'}
                  onValueChange={(value) => setEditingPermission(prev => ({
                    ...prev!,
                    lenders_scope: value as any,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Analytics Access</Label>
                <Select 
                  value={editingPermission?.analytics_scope || 'own'}
                  onValueChange={(value) => setEditingPermission(prev => ({
                    ...prev!,
                    analytics_scope: value as any,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reports Access</Label>
                <Select 
                  value={editingPermission?.reports_scope || 'own'}
                  onValueChange={(value) => setEditingPermission(prev => ({
                    ...prev!,
                    reports_scope: value as any,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Capability Toggles */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Capabilities</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Export Data</p>
                    <p className="text-sm text-muted-foreground">Can export to CSV/PDF</p>
                  </div>
                  <Switch 
                    checked={editingPermission?.can_export ?? true}
                    onCheckedChange={(checked) => setEditingPermission(prev => ({
                      ...prev!,
                      can_export: checked,
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Bulk Edit</p>
                    <p className="text-sm text-muted-foreground">Can edit multiple items</p>
                  </div>
                  <Switch 
                    checked={editingPermission?.can_bulk_edit ?? true}
                    onCheckedChange={(checked) => setEditingPermission(prev => ({
                      ...prev!,
                      can_bulk_edit: checked,
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Delete Records</p>
                    <p className="text-sm text-muted-foreground">Can permanently delete</p>
                  </div>
                  <Switch 
                    checked={editingPermission?.can_delete ?? false}
                    onCheckedChange={(checked) => setEditingPermission(prev => ({
                      ...prev!,
                      can_delete: checked,
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">View Financials</p>
                    <p className="text-sm text-muted-foreground">Can see deal values</p>
                  </div>
                  <Switch 
                    checked={editingPermission?.can_view_financials ?? true}
                    onCheckedChange={(checked) => setEditingPermission(prev => ({
                      ...prev!,
                      can_view_financials: checked,
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3 col-span-2">
                  <div>
                    <p className="font-medium">View Sensitive Data</p>
                    <p className="text-sm text-muted-foreground">Can see emails, contacts, notes</p>
                  </div>
                  <Switch 
                    checked={editingPermission?.can_view_sensitive ?? true}
                    onCheckedChange={(checked) => setEditingPermission(prev => ({
                      ...prev!,
                      can_view_sensitive: checked,
                    }))}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Reason for these permissions..."
                value={editingPermission?.notes || ''}
                onChange={(e) => setEditingPermission(prev => ({
                  ...prev!,
                  notes: e.target.value,
                }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
