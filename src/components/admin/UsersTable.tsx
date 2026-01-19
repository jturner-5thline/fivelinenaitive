import { useState } from "react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Search, Shield, ShieldCheck, Trash2, UserPlus, Users, UserX, Globe, Home, Ban, UserCheck } from "lucide-react";
import { useConsolidatedUsers, useUserRoles, useAddUserRole, useRemoveUserRole, useBulkAddUserRole, useDeleteUser, useToggleUserSuspension } from "@/hooks/useAdminData";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const UsersTable = () => {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<"admin" | "moderator" | "user">("user");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<"admin" | "moderator" | "user">("admin");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string; isExternal: boolean } | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "external">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [userToSuspend, setUserToSuspend] = useState<{ id: string; name: string; isSuspended: boolean } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  
  const { data: users, isLoading: usersLoading } = useConsolidatedUsers();
  const { data: roles, isLoading: rolesLoading } = useUserRoles();
  const addRole = useAddUserRole();
  const removeRole = useRemoveUserRole();
  const bulkAddRole = useBulkAddUserRole();
  const deleteUser = useDeleteUser();
  const toggleSuspension = useToggleUserSuspension();

  const isLoading = usersLoading || rolesLoading;

  const getUserRoles = (userId: string) => {
    return roles?.filter((r) => r.user_id === userId) || [];
  };

  const filteredUsers = users?.filter((u) => {
    const matchesSearch = 
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.last_name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesSource = sourceFilter === "all" || u.source === sourceFilter;
    
    const matchesStatus = 
      statusFilter === "all" || 
      (statusFilter === "suspended" && u.suspended_at) ||
      (statusFilter === "active" && !u.suspended_at);
    
    return matchesSearch && matchesSource && matchesStatus;
  });

  const localUsersCount = users?.filter(u => u.source === 'local').length || 0;
  const externalUsersCount = users?.filter(u => u.source === 'external').length || 0;

  const handleAddRole = () => {
    if (selectedUserId && selectedRole) {
      addRole.mutate({ userId: selectedUserId, role: selectedRole });
      setSelectedUserId(null);
    }
  };

  const handleToggleUser = (userId: string, isExternal: boolean) => {
    if (isExternal) return; // Can't select external users for bulk actions
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedUserIds(newSet);
  };

  const handleSelectAll = () => {
    const localUsers = filteredUsers?.filter(u => u.source === 'local') || [];
    const allSelected = localUsers.every(u => selectedUserIds.has(u.user_id));
    
    if (allSelected && localUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(localUsers.map(u => u.user_id)));
    }
  };

  const handleBulkAddRole = () => {
    if (selectedUserIds.size > 0 && bulkRole) {
      bulkAddRole.mutate(
        { userIds: Array.from(selectedUserIds), role: bulkRole },
        {
          onSuccess: () => {
            setSelectedUserIds(new Set());
            setBulkDialogOpen(false);
          },
        }
      );
    }
  };

  const handleDeleteUser = () => {
    if (userToDelete && !userToDelete.isExternal) {
      deleteUser.mutate(userToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setUserToDelete(null);
        },
      });
    }
  };

  const openDeleteDialog = (userId: string, displayName: string, isExternal: boolean) => {
    setUserToDelete({ id: userId, name: displayName, isExternal });
    setDeleteDialogOpen(true);
  };

  const openSuspendDialog = (userId: string, displayName: string, isSuspended: boolean) => {
    setUserToSuspend({ id: userId, name: displayName, isSuspended });
    setSuspendReason("");
    setSuspendDialogOpen(true);
  };

  const handleToggleSuspension = () => {
    if (userToSuspend) {
      toggleSuspension.mutate(
        { 
          userId: userToSuspend.id, 
          suspend: !userToSuspend.isSuspended, 
          reason: suspendReason || undefined 
        },
        {
          onSuccess: () => {
            setSuspendDialogOpen(false);
            setUserToSuspend(null);
            setSuspendReason("");
          },
        }
      );
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
                <TableHead className="w-12"></TableHead>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Stats summary */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Home className="h-4 w-4" />
            <span>{localUsersCount} local</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Globe className="h-4 w-4" />
            <span>{externalUsersCount} FLEx</span>
          </div>
          <span className="text-foreground font-medium">
            {(localUsersCount + externalUsersCount)} total users
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="local">Local Only</SelectItem>
              <SelectItem value="external">FLEx Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="suspended">Suspended Only</SelectItem>
            </SelectContent>
          </Select>

          {selectedUserIds.size > 0 && (
            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default" size="sm" className="gap-2">
                  <Users className="h-4 w-4" />
                  Assign Role to {selectedUserIds.size} User{selectedUserIds.size !== 1 ? 's' : ''}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Role Assignment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Assign a role to {selectedUserIds.size} selected user{selectedUserIds.size !== 1 ? 's' : ''}.
                  </p>
                  <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as typeof bulkRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleBulkAddRole} 
                    className="w-full"
                    disabled={bulkAddRole.isPending}
                  >
                    {bulkAddRole.isPending ? "Adding..." : `Add ${bulkRole} Role`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Checkbox 
                          checked={
                            filteredUsers && 
                            filteredUsers.filter(u => u.source === 'local').length > 0 && 
                            filteredUsers.filter(u => u.source === 'local').every(u => selectedUserIds.has(u.user_id))
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select all local users</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers?.map((user) => {
                const userRoles = getUserRoles(user.user_id);
                const isExternal = user.source === 'external';
                
                return (
                  <TableRow key={user.id} className={`${isExternal ? "bg-muted/30" : ""} ${user.suspended_at ? "opacity-60" : ""}`}>
                    <TableCell>
                      {!isExternal ? (
                        <Checkbox 
                          checked={selectedUserIds.has(user.user_id)}
                          onCheckedChange={() => handleToggleUser(user.user_id, isExternal)}
                        />
                      ) : (
                        <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="w-4 h-4 flex items-center justify-center">
                              <Globe className="h-3 w-3 text-muted-foreground" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>FLEx users are read-only</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.display_name?.[0] || user.email?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{user.display_name || "No name"}</p>
                            {user.suspended_at && (
                              <Badge variant="destructive" className="text-xs">Suspended</Badge>
                            )}
                          </div>
                          {user.first_name && (
                            <p className="text-xs text-muted-foreground">
                              {user.first_name} {user.last_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={isExternal ? "outline" : "secondary"}
                        className="flex items-center gap-1 w-fit"
                      >
                        {isExternal ? (
                          <>
                            <Globe className="h-3 w-3" />
                            FLEx
                          </>
                        ) : (
                          <>
                            <Home className="h-3 w-3" />
                            Local
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {isExternal ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : userRoles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No roles</span>
                        ) : (
                          userRoles.map((role) => (
                            <Badge 
                              key={role.id} 
                              variant={role.role === "admin" ? "destructive" : "secondary"}
                              className="flex items-center gap-1"
                            >
                              {role.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                              {role.role}
                              <button
                                onClick={() => removeRole.mutate(role.id)}
                                className="ml-1 hover:text-destructive-foreground"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(user.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {!isExternal ? (
                        <div className="flex items-center gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setSelectedUserId(user.user_id)}
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Role to {user.display_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as typeof selectedRole)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="moderator">Moderator</SelectItem>
                                    <SelectItem value="user">User</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button onClick={handleAddRole} className="w-full">
                                  Add Role
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className={user.suspended_at ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"}
                                onClick={() => openSuspendDialog(user.user_id, user.display_name || user.email || "User", !!user.suspended_at)}
                              >
                                {user.suspended_at ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{user.suspended_at ? "Unsuspend user" : "Suspend user"}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDeleteDialog(user.user_id, user.display_name || user.email || "User", isExternal)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredUsers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Delete User Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
                {userToDelete?.isExternal ? (
                  <>FLEx users cannot be deleted from this project. Manage them in FLEx.</>
                ) : (
                  <>Are you sure you want to delete <strong>{userToDelete?.name}</strong>? This action cannot be undone and will permanently remove all their data.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              {!userToDelete?.isExternal && (
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteUser}
                  disabled={deleteUser.isPending}
                >
                  {deleteUser.isPending ? "Deleting..." : "Delete User"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Suspend User Confirmation Dialog */}
        <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {userToSuspend?.isSuspended ? "Unsuspend User" : "Suspend User"}
              </DialogTitle>
              <DialogDescription>
                {userToSuspend?.isSuspended ? (
                  <>This will restore access for <strong>{userToSuspend?.name}</strong>. They will be able to log in and use the platform again.</>
                ) : (
                  <>This will prevent <strong>{userToSuspend?.name}</strong> from accessing the platform. They will not be able to log in until unsuspended.</>
                )}
              </DialogDescription>
            </DialogHeader>
            {!userToSuspend?.isSuspended && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason (optional)</label>
                <Textarea
                  placeholder="Enter reason for suspension..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant={userToSuspend?.isSuspended ? "default" : "destructive"}
                onClick={handleToggleSuspension}
                disabled={toggleSuspension.isPending}
              >
                {toggleSuspension.isPending 
                  ? (userToSuspend?.isSuspended ? "Unsuspending..." : "Suspending...")
                  : (userToSuspend?.isSuspended ? "Unsuspend User" : "Suspend User")
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};