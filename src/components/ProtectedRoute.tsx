import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useIsApproved } from '@/hooks/useUserApproval';
import { Skeleton } from '@/components/ui/skeleton';

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

  // Check if user is a 5thline.co user (auto-approved)
  const is5thLineUser = user?.email?.endsWith('@5thline.co') ?? false;

  const isLoading = authLoading || profileLoading || (!is5thLineUser && !skipApprovalCheck && approvalLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-32 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check approval status (skip for 5thline.co users or if explicitly skipped)
  if (!skipApprovalCheck && !is5thLineUser && isApproved === false) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Redirect to onboarding if not completed (unless skipOnboarding is true)
  if (!skipOnboarding && profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
