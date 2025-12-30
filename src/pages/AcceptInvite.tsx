import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'accepted'>('loading');
  const [invitation, setInvitation] = useState<any>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    const checkInvitation = async () => {
      const { data, error } = await supabase
        .from('company_invitations')
        .select('*, companies(name)')
        .eq('token', token)
        .single();

      if (error || !data) {
        setStatus('invalid');
        return;
      }

      if (data.accepted_at) {
        setStatus('accepted');
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setStatus('expired');
        return;
      }

      setInvitation(data);
      setCompanyName(data.companies?.name || 'Unknown Company');
      setStatus('valid');
    };

    checkInvitation();
  }, [token]);

  const handleAccept = async () => {
    if (!user || !invitation) return;

    setIsAccepting(true);

    try {
      // Check if user email matches invitation
      if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        toast({
          title: "Email mismatch",
          description: `This invitation was sent to ${invitation.email}. Please sign in with that email address.`,
          variant: "destructive",
        });
        setIsAccepting(false);
        return;
      }

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('company_members')
        .select('id')
        .eq('company_id', invitation.company_id)
        .eq('user_id', user.id)
        .single();

      if (existingMember) {
        toast({
          title: "Already a member",
          description: "You are already a member of this company.",
        });
        navigate('/deals');
        return;
      }

      // Add user as company member
      const { error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: invitation.company_id,
          user_id: user.id,
          role: invitation.role,
        });

      if (memberError) throw memberError;

      // Mark invitation as accepted
      await supabase
        .from('company_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id);

      toast({
        title: "Welcome to the team!",
        description: `You've successfully joined ${companyName}`,
      });

      navigate('/deals');
    } catch (error: any) {
      console.error('Error accepting invitation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept invitation",
        variant: "destructive",
      });
    } finally {
      setIsAccepting(false);
    }
  };

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Accept Invitation - nAItive</title>
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
                <CardTitle>Join {companyName}</CardTitle>
                <CardDescription>
                  You've been invited to join as a {invitation?.role === 'admin' ? 'Admin' : 'User'}.
                  Sign in or create an account to accept.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" onClick={() => navigate(`/auth?redirect=/accept-invite?token=${token}`)}>
                  Sign In to Accept
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Make sure to sign in with <strong>{invitation?.email}</strong>
                </p>
              </CardContent>
            </>
          )}

          {status === 'valid' && user && (
            <>
              <CardHeader className="text-center">
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Join {companyName}</CardTitle>
                <CardDescription>
                  Accept your invitation to join the team as a {invitation?.role === 'admin' ? 'Admin' : 'User'}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" onClick={handleAccept} disabled={isAccepting}>
                  {isAccepting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    'Accept Invitation'
                  )}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate('/deals')}>
                  Decline
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
