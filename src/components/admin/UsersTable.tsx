import { useState } from "react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Shield, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useAllProfiles, useUserRoles, useAddUserRole, useRemoveUserRole, useBulkAddUserRole } from "@/hooks/useAdminData";

export const UsersTable = () => {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<"admin" | "moderator" | "user">("user");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<"admin" | "moderator" | "user">("admin");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  
  const { data: profiles, isLoading: profilesLoading } = useAllProfiles();
  const { data: roles, isLoading: rolesLoading } = useUserRoles();
  const addRole = useAddUserRole();
  const removeRole = useRemoveUserRole();
  const bulkAddRole = useBulkAddUserRole();

  const isLoading = profilesLoading || rolesLoading;

  const getUserRoles = (userId: string) => {
    return roles?.filter((r) => r.user_id === userId) || [];
  };

  const filteredProfiles = profiles?.filter(
    (p) =>
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.last_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddRole = () => {
    if (selectedUserId && selectedRole) {
      addRole.mutate({ userId: selectedUserId, role: selectedRole });
      setSelectedUserId(null);
    }
  };

  const handleToggleUser = (userId: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedUserIds(newSet);
  };

  const handleSelectAll = () => {
    if (filteredProfiles && selectedUserIds.size === filteredProfiles.length) {
      setSelectedUserIds(new Set());
    } else if (filteredProfiles) {
      setSelectedUserIds(new Set(filteredProfiles.map(p => p.user_id)));
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
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
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
                <Checkbox 
                  checked={filteredProfiles && filteredProfiles.length > 0 && selectedUserIds.size === filteredProfiles.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProfiles?.map((profile) => {
              const userRoles = getUserRoles(profile.user_id);
              return (
                <TableRow key={profile.id}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedUserIds.has(profile.user_id)}
                      onCheckedChange={() => handleToggleUser(profile.user_id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile.avatar_url} />
                        <AvatarFallback>
                          {profile.display_name?.[0] || profile.email?.[0] || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{profile.display_name || "No name"}</p>
                        {profile.first_name && (
                          <p className="text-xs text-muted-foreground">
                            {profile.first_name} {profile.last_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {userRoles.length === 0 ? (
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
                    {format(new Date(profile.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedUserId(profile.user_id)}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Role to {profile.display_name}</DialogTitle>
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
