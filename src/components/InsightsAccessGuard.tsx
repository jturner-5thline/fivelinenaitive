import { useEffect, useState } from 'react';
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
  const [timedOut, setTimedOut] = useState(false);

  const stillLoading = isLoading || (user && allowlistLoading);

  // Safety timeout: never spin forever on the guard. If auth/allowlist
  // hasn't resolved in 15s, fall through to the normal allow/deny decision
  // based on whatever state we have so the page can render or redirect.
  useEffect(() => {
    if (!stillLoading) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => {
      console.error('[InsightsAccessGuard] auth/allowlist did not resolve in 15s', {
        isLoading,
        allowlistLoading,
        userEmail: user?.email ?? null,
      });
      setTimedOut(true);
    }, 15_000);
    return () => clearTimeout(t);
  }, [stillLoading, isLoading, allowlistLoading, user?.email]);

  // Wait for both auth and (if user present) the allowlist query before deciding.
  if (stillLoading && !timedOut) {
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
