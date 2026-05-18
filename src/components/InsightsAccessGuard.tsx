import { Navigate, useLocation } from 'react-router-dom';
import { useCanAccessInsightsStatus } from '@/hooks/useCanAccessInsights';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export function InsightsAccessGuard({ children }: Props) {
  const { isLoading, user } = useAuth();
  const { allowed, isLoading: allowlistLoading } = useCanAccessInsightsStatus();
  const location = useLocation();

  // Wait for both auth and (if user present) the allowlist query before deciding.
  if (isLoading || (user && allowlistLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Send unauthenticated users AND authenticated users without Insights
  // access to the login page so the email CTA works for both groups.
  if (!user || !allowed) {
    const target = `${location.pathname}${location.search}${location.hash}`;
    const redirectQuery = target ? `?redirect=${encodeURIComponent(target)}` : '';
    return <Navigate to={`/login${redirectQuery}`} replace />;
  }

  return <>{children}</>;
}
