import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { seedSampleDeal } from '@/utils/seedSampleDeal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Mail, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ProfileSetupModal } from '@/components/onboarding/ProfileSetupModal';
import { MigrateDealsDialog } from '@/components/company/MigrateDealsDialog';
import { useQueryClient } from '@tanstack/react-query';
interface InvitationData {
  id: string;
  email: string;
  role: string;
  company_id: string;
  company_name: string;
  expires_at: string;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'accepted'>('loading');
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showMigrateDeals, setShowMigrateDeals] = useState(false);
  const [autoAcceptTriggered, setAutoAcceptTriggered] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    const checkInvitation = async () => {
      try {
        // Use secure edge function to validate token
        const { data, error } = await supabase.functions.invoke('validate-invitation', {
          body: { token }
        });

        if (error) {
          console.error('Error validating invitation:', error);
          setStatus('invalid');
          return;
        }

        if (data.status === 'invalid') {
          setStatus('invalid');
          return;
        }

        if (data.status === 'accepted') {
          setStatus('accepted');
          return;
        }

        if (data.status === 'expired') {
          setStatus('expired');
          return;
        }

        if (data.status === 'valid' && data.invitation) {
          setInvitation(data.invitation);
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      } catch (err) {
        console.error('Error checking invitation:', err);
        setStatus('invalid');
      }
    };

    checkInvitation();
  }, [token]);

  const handleAccept = useCallback(async () => {
    if (!user || !invitation || !token) return;

    setIsAccepting(true);

    try {
      // Check if user email matches invitation (skip for link-only invites)
      const isLinkOnlyInvite = invitation.email.includes('@placeholder.local');
      if (!isLinkOnlyInvite && user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        toast({
          title: "Email mismatch",
          description: `This invitation was sent to ${invitation.email}. Please sign in with that email address.`,
          variant: "destructive",
        });
        setIsAccepting(false);
        return;
      }

      // The server verifies and commits membership, acceptance, and approval together.
      const { error: acceptError } = await supabase.rpc('accept_company_invitation', { _token: token });
      if (acceptError) throw acceptError;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-approved', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['company', user.id] }),
      ]);

      // Seed sample deal (or repair orphaned one) for this user+company
      try {
        await seedSampleDeal(user.id, invitation.company_id);
      } catch (seedErr) {
        console.error('Sample deal seed/repair failed:', seedErr);
      }

      toast({
        title: "Welcome to the team!",
        description: `You've successfully joined ${invitation.company_name}`,
      });

      // Check if profile needs to be completed
      const needsProfileSetup = !profile?.first_name || !profile?.display_name;
      if (needsProfileSetup) {
        setShowProfileSetup(true);
      } else {
        // Show migrate deals dialog
        setShowMigrateDeals(true);
      }
    } catch (error: unknown) {
      console.error('Error accepting invitation:', error);
      toast({
        title: "Error",
        description: error && typeof error === 'object' && 'message' in error
          ? String(error.message) : "Failed to accept invitation",
        variant: "destructive",
      });
    } finally {
      setIsAccepting(false);
    }
  }, [user, invitation, token, queryClient, profile]);

  // Wait for the profile before deciding whether setup is needed.
  useEffect(() => {
    if (status === 'valid' && user && invitation && !profileLoading && !autoAcceptTriggered && !isAccepting) {
      setAutoAcceptTriggered(true);
      void handleAccept();
    }
  }, [status, user, invitation, profileLoading, autoAcceptTriggered, isAccepting, handleAccept]);

  const handleProfileSetupComplete = () => {
    setShowProfileSetup(false);
    // Show migrate deals dialog after profile setup
    setShowMigrateDeals(true);
  };

  const handleMigrateDealsClose = () => {
    setShowMigrateDeals(false);
    navigate('/deals');
  };

  if (authLoading || status === 'loading' || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Accept Invitation - naitive</title>
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          {status === 'invalid' && (
            <>
              <CardHeader className="text-center">
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <CardTitle>Invalid Invitation</CardTitle>
                <CardDescription>
                  This invitation link is invalid or has been revoked.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button onClick={() => navigate('/auth')}>Go to Sign In</Button>
              </CardContent>
            </>
          )}

          {status === 'expired' && (
            <>
              <CardHeader className="text-center">
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <CardTitle>Invitation Expired</CardTitle>
                <CardDescription>
                  This invitation has expired. Please ask for a new invitation.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button onClick={() => navigate('/auth')}>Go to Sign In</Button>
              </CardContent>
            </>
          )}

          {status === 'accepted' && (
            <>
              <CardHeader className="text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <CardTitle>Already Accepted</CardTitle>
                <CardDescription>
                  This invitation has already been accepted.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button onClick={() => navigate('/deals')}>Go to Deals</Button>
              </CardContent>
            </>
          )}

          {status === 'valid' && !user && (
            <>
              <CardHeader className="text-center">
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Join {invitation?.company_name}</CardTitle>
                <CardDescription>
                  You've been invited to join as a {invitation?.role === 'admin' ? 'Admin' : 'Member'}.
                  Sign in or create an account to accept.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {invitation?.expires_at && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md py-2 px-3">
                    <Clock className="h-4 w-4" />
                    <span>Expires {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}</span>
                  </div>
                )}
                <Button className="w-full" onClick={() => navigate(`/auth?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`)}>
                  Sign In to Accept
                </Button>
                {invitation?.email && !invitation.email.includes('@placeholder.local') && (
                  <p className="text-sm text-center text-muted-foreground">
                    Make sure to sign in with <strong>{invitation.email}</strong>
                  </p>
                )}
              </CardContent>
            </>
          )}

          {status === 'valid' && user && (
            <>
              <CardHeader className="text-center">
                {isAccepting ? (
                  <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
                ) : (
                  <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                )}
                <CardTitle>
                  {isAccepting ? `Joining ${invitation?.company_name}...` : `Join ${invitation?.company_name}`}
                </CardTitle>
                <CardDescription>
                  {isAccepting 
                    ? 'Please wait while we add you to the team.'
                    : `Accept your invitation to join the team as a ${invitation?.role === 'admin' ? 'Admin' : 'Member'}.`
                  }
                </CardDescription>
              </CardHeader>
              {!isAccepting && (
                <CardContent className="space-y-3">
                  {invitation?.expires_at && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md py-2 px-3">
                      <Clock className="h-4 w-4" />
                      <span>Expires {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}</span>
                    </div>
                  )}
                  <Button className="w-full" onClick={handleAccept} disabled={isAccepting}>
                    Accept Invitation
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => navigate('/deals')}>
                    Decline
                  </Button>
                </CardContent>
              )}
            </>
          )}
        </Card>
      </div>
      
      {/* Profile Setup Modal for new users */}
      <ProfileSetupModal 
        open={showProfileSetup} 
        onComplete={handleProfileSetupComplete}
        companyName={invitation?.company_name}
      />

      {/* Migrate Deals Dialog */}
      {user && invitation && (
        <MigrateDealsDialog
          open={showMigrateDeals}
          onClose={handleMigrateDealsClose}
          companyId={invitation.company_id}
          companyName={invitation.company_name}
          userId={user.id}
        />
      )}
    </>
  );
}
