// Approval errors remain distinct from confirmed pending accounts.
import { Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useIsApproved } from '@/hooks/useUserApproval';
import { Loader2 } from 'lucide-react';
import { ApprovalCheckError } from '@/components/ApprovalCheckError';

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
  const { data: isApproved, isLoading: approvalLoading, isError: approvalError, isFetching, refetch } = useIsApproved();
  const location = useLocation();

  // Demo users skip onboarding entirely — they go straight to their seeded workspace.
  const isDemoUser = Boolean((profile as { is_demo_user?: boolean } | null)?.is_demo_user);
  const is5thLineUser = user?.email?.toLowerCase().endsWith('@5thline.co') ?? false;
  const autoApproved = is5thLineUser || isDemoUser;
  const needsApprovalCheck = !!user && !skipApprovalCheck && !autoApproved;

  const isLoading = authLoading || profileLoading || (needsApprovalCheck && approvalLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const target = `${location.pathname}${location.search}${location.hash}`;
    const redirectQuery = target && target !== '/' ? `?redirect=${encodeURIComponent(target)}` : '';
    return <Navigate to={`/login${redirectQuery}`} replace />;
  }

  if (needsApprovalCheck && approvalError) {
    return <ApprovalCheckError onRetry={() => { void refetch(); }} isRetrying={isFetching} />;
  }

  // Unapproved users (not 5th Line, not demo) wait for approval.
  if (needsApprovalCheck && isApproved !== true) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Redirect to onboarding if not completed (unless skipOnboarding is true or demo user)
  if (!skipOnboarding && !isDemoUser && profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
