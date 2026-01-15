import { useRateLimiter } from '@/hooks/useRateLimiter';
import { AlertTriangle, Clock, ShieldX } from 'lucide-react';

interface RateLimitGuardProps {
  children: React.ReactNode;
  path?: string;
}

export const RateLimitGuard = ({ children, path }: RateLimitGuardProps) => {
  const { isBlocked, isLoading, retryAfter, reason } = useRateLimiter(path);

  if (isLoading) {
    return null; // Don't flash content while checking
  }

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            {reason === 'bot_detected' ? (
              <ShieldX className="h-16 w-16 text-destructive" />
            ) : (
              <AlertTriangle className="h-16 w-16 text-warning" />
            )}
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              {reason === 'bot_detected' 
                ? 'Access Denied' 
                : 'Too Many Requests'
              }
            </h1>
            <p className="text-muted-foreground">
              {reason === 'bot_detected'
                ? 'Automated access to this site is not permitted.'
                : 'You have made too many requests. Please wait before trying again.'
              }
            </p>
          </div>

          {retryAfter && retryAfter > 0 && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span>
                Try again in {Math.floor(retryAfter / 60)}:{(retryAfter % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact support.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
