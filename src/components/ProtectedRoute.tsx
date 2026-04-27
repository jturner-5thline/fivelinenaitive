// v3 - with pending company join request redirect
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useIsApproved } from '@/hooks/useUserApproval';
import { useMyJoinRequests } from '@/hooks/useCompanyJoinRequests';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  skipOnboarding?: boolean;
  skipApprovalCheck?: boolean;
}

export function ProtectedRoute({ 
  children, 
  skipOnboarding = false,
  skipApprovalCheck = false 
}: ProtectedRouteProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { data: isApproved, isLoading: approvalLoading } = useIsApproved();
  const { data: joinRequests, isLoading: joinRequestsLoading } = useMyJoinRequests();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      setAuthTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      console.warn('[ProtectedRoute] auth loading timed out after 5s; redirecting to /login');
      setAuthTimedOut(true);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [authLoading]);

  // Check if user is a 5thline.co user (auto-approved)
  const is5thLineUser = user?.email?.endsWith('@5thline.co') ?? false;

  // While auth itself is resolving, show a visible full-screen loading state.
  if (authLoading && !authTimedOut) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // No authenticated user — redirect to login immediately.
  // (Do NOT wait on user-scoped queries; they stay in pending state when
  // disabled, which would block the redirect and produce a blank screen.)
  if (authTimedOut || !user) {
    return <Navigate to="/login" replace />;
  }

  // Now that we have a user, wait for the user-scoped data to resolve.
  const userDataLoading =
    profileLoading ||
    (!is5thLineUser && !skipApprovalCheck && approvalLoading) ||
    joinRequestsLoading;

  if (userDataLoading) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // Check approval status (skip for 5thline.co users or if explicitly skipped)
  if (!skipApprovalCheck && !is5thLineUser && isApproved === false) {
    // Check if user has a pending company join request — redirect to pending-company-approval instead
    const hasPendingJoinRequest = joinRequests?.some((r: any) => r.status === 'pending');
    if (hasPendingJoinRequest) {
      return <Navigate to="/pending-company-approval" replace />;
    }
    return <Navigate to="/pending-approval" replace />;
  }

  // Redirect to onboarding if not completed (unless skipOnboarding is true)
  if (!skipOnboarding && profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
