import { useCompany, CompanyRole } from '@/hooks/useCompany';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Users, Trash2, Shield, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InviteMemberDialog } from './InviteMemberDialog';
import { BulkInviteDialog } from './BulkInviteDialog';
import { ShareInviteLinkDialog } from './ShareInviteLinkDialog';
import { PendingInvitations } from './PendingInvitations';

const roleIcons: Record<CompanyRole, React.ReactNode> = {
  owner: <Shield className="h-4 w-4 text-primary" />,
  admin: <Shield className="h-4 w-4 text-primary" />,
  member: <User className="h-4 w-4 text-muted-foreground" />,
};

const roleBadgeVariants: Record<CompanyRole, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
};

// Display names for roles (member shows as "User" in UI)
const roleDisplayNames: Record<CompanyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'User',
};

export function CompanyMembersSettings() {
  const { user } = useAuth();
  const { company, members, isAdmin, isOwner, updateMemberRole, removeMember } = useCompany();

  const handleRoleChange = async (memberId: string, newRole: CompanyRole) => {
    await updateMemberRole(memberId, newRole);
  };

  const handleRemoveMember = async (memberId: string) => {
    await removeMember(memberId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                {members.length} member{members.length !== 1 ? 's' : ''} in your company
              </CardDescription>
            </div>
            {company && (
              <div className="flex items-center gap-2">
                <ShareInviteLinkDialog companyId={company.id} companyName={company.name} />
                <InviteMemberDialog companyId={company.id} companyName={company.name} />
                {isAdmin && (
                  <BulkInviteDialog companyId={company.id} companyName={company.name} />
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => {
              const isCurrentUser = member.user_id === user?.id;
              const canModify = isAdmin && !isCurrentUser && member.role !== 'owner';
              
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar_url || undefined} alt={member.display_name || 'User'} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {member.display_name?.charAt(0) || member.email?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {member.display_name || member.email || 'Unknown User'}
                        </p>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {member.email || `User ID: ${member.user_id.slice(0, 8)}...`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canModify ? (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.id, value as CompanyRole)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue>
                              {roleDisplayNames[member.role]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                {roleIcons.admin}
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="member">
                              <div className="flex items-center gap-2">
                                {roleIcons.member}
                                User
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Member</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove this member from the company? 
                                They will lose access to all company data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemoveMember(member.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <Badge variant={roleBadgeVariants[member.role]}>
                        <span className="flex items-center gap-1.5">
                          {roleIcons[member.role]}
                          {roleDisplayNames[member.role]}
                        </span>
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {members.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              No team members found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {isAdmin && company && (
        <PendingInvitations companyId={company.id} companyName={company.name} />
      )}

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {roleIcons.owner}
              <div>
                <p className="font-medium">Owner</p>
                <p className="text-sm text-muted-foreground">
                  Full access to all company settings, can delete company, cannot be removed
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              {roleIcons.admin}
              <div>
                <p className="font-medium">Admin</p>
                <p className="text-sm text-muted-foreground">
                  Can manage team members, edit company settings, and access all company deals
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              {roleIcons.member}
              <div>
                <p className="font-medium">User</p>
                <p className="text-sm text-muted-foreground">
                  Can view and edit all company deals, view team members
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
