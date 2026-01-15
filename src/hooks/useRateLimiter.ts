import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RateLimitState {
  isBlocked: boolean;
  isLoading: boolean;
  retryAfter: number | null;
  reason: string | null;
}

export const useRateLimiter = (path?: string) => {
  const [state, setState] = useState<RateLimitState>({
    isBlocked: false,
    isLoading: true,
    retryAfter: null,
    reason: null,
  });

  const checkRateLimit = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('rate-limit', {
        body: { path: path || window.location.pathname },
      });

      if (error) {
        console.error('Rate limit check error:', error);
        // Don't block on errors
        setState({ isBlocked: false, isLoading: false, retryAfter: null, reason: null });
        return;
      }

      if (!data.allowed) {
        setState({
          isBlocked: true,
          isLoading: false,
          retryAfter: data.retryAfter || 60,
          reason: data.reason || 'rate_limited',
        });
      } else {
        setState({
          isBlocked: false,
          isLoading: false,
          retryAfter: null,
          reason: null,
        });
      }
    } catch (err) {
      console.error('Rate limit check failed:', err);
      // Don't block on errors
      setState({ isBlocked: false, isLoading: false, retryAfter: null, reason: null });
    }
  }, [path]);

  useEffect(() => {
    checkRateLimit();
  }, [checkRateLimit]);

  // Countdown timer for retry
  useEffect(() => {
    if (!state.isBlocked || !state.retryAfter) return;

    const interval = setInterval(() => {
      setState(prev => {
        if (!prev.retryAfter || prev.retryAfter <= 1) {
          // Re-check when timer expires
          checkRateLimit();
          return { ...prev, retryAfter: null };
        }
        return { ...prev, retryAfter: prev.retryAfter - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isBlocked, checkRateLimit]);

  return {
    ...state,
    checkRateLimit,
  };
};
