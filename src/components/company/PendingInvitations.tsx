import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Mail, Trash2, RefreshCw, Clock, Loader2, Shield, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Invitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

interface PendingInvitationsProps {
  companyId: string;
  companyName: string;
}

export function PendingInvitations({ companyId, companyName }: PendingInvitationsProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    const { data, error } = await supabase
      .from('company_invitations')
      .select('*')
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
    } else {
      setInvitations(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInvitations();
  }, [companyId]);

  const handleResend = async (invitation: Invitation) => {
    setResendingId(invitation.id);

    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user?.id)
        .maybeSingle();

      // Send the invitation email
      const { error } = await supabase.functions.invoke('send-invite', {
        body: {
          invitationId: invitation.id,
          email: invitation.email,
          companyName,
          inviterName: profile?.display_name || user?.email || 'A team member',
          role: invitation.role === 'admin' ? 'Admin' : 'User',
          token: invitation.token,
        },
      });

      if (error) throw error;

      toast({
        title: 'Invitation resent',
        description: `A new invitation email has been sent to ${invitation.email}`,
      });
    } catch (error: any) {
      console.error('Error resending invitation:', error);
      toast({
        title: 'Failed to resend',
        description: error.message || 'Could not resend the invitation',
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('company_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(invitations.filter(i => i.id !== invitationId));

      toast({
        title: 'Invitation revoked',
        description: 'The invitation has been cancelled.',
      });
    } catch (error: any) {
      console.error('Error revoking invitation:', error);
      toast({
        title: 'Failed to revoke',
        description: error.message || 'Could not revoke the invitation',
        variant: 'destructive',
      });
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending Invitations
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (invitations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Pending Invitations
        </CardTitle>
        <CardDescription>
          {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invitations.map((invitation) => {
            const expired = isExpired(invitation.expires_at);
            
            return (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{invitation.email}</p>
                      <Badge variant={invitation.role === 'admin' ? 'secondary' : 'outline'} className="text-xs">
                        <span className="flex items-center gap-1">
                          {invitation.role === 'admin' ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          {invitation.role === 'admin' ? 'Admin' : 'User'}
                        </span>
                      </Badge>
                      {expired && (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Sent {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
                      {!expired && (
                        <span className="ml-2">
                          • Expires {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResend(invitation)}
                    disabled={resendingId === invitation.id}
                  >
                    {resendingId === invitation.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Resend
                      </>
                    )}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to revoke this invitation? 
                          {invitation.email} will no longer be able to join using this link.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRevoke(invitation.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
