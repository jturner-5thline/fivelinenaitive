// v3 - with pending company join request redirect
import { Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
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
  const location = useLocation();

  // Check if user is a 5thline.co user (auto-approved)
  const is5thLineUser = user?.email?.endsWith('@5thline.co') ?? false;

  const isLoading = authLoading || profileLoading || (!is5thLineUser && !skipApprovalCheck && approvalLoading) || joinRequestsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Preserve the originally requested path so the auth flow returns
    // the user back here after sign-in (e.g. email CTA -> /insights).
    const target = `${location.pathname}${location.search}${location.hash}`;
    const redirectQuery = target && target !== '/' ? `?redirect=${encodeURIComponent(target)}` : '';
    return <Navigate to={`/login${redirectQuery}`} replace />;
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
