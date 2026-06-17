import { useEffect, useState } from 'react';
import { ShieldAlert, LogOut, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { stopImpersonation } from '@/lib/adminImpersonation';
import { useImpersonationState } from '@/hooks/useImpersonationState';

/**
 * Persistent, platform-wide banner shown while an admin is viewing the app
 * as a demo user. Stays visible on every page so actions are never taken
 * accidentally under the wrong identity.
 */
export function ImpersonationBanner() {
  const { impersonation } = useImpersonationState();
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  useEffect(() => {
    if (!impersonation) return;
    try {
      const original = document.title;
      const tag = `[Demo: ${impersonation.target_demo_email}]`;
      if (!original.startsWith(tag)) document.title = `${tag} ${original}`;
    } catch { /* ignore */ }
  }, [impersonation]);

  if (!impersonation) return null;

  const handleReturn = async () => {
    setReturning(true);
    setReturnError(null);
    const res = await stopImpersonation({ sessionId: impersonation.id });
    if (res.returnLink) {
      window.location.href = res.returnLink;
      return;
    }
    const msg = res.error || 'Could not restore admin session.';
    setReturnError(msg);
    toast.error(msg);
    setReturning(false);
  };

  const openAdminNewTab = () => {
    window.open('/admin?section=users-permissions&page=demo-metrics', '_blank', 'noopener');
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-[100] w-full border-b border-amber-500/40 bg-amber-500/15 backdrop-blur supports-[backdrop-filter]:bg-amber-500/10"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-200">Viewing as demo user: </span>
          <span className="text-amber-100">{impersonation.target_demo_email}</span>
          {impersonation.source_admin_email && (
            <span className="text-amber-200/70 ml-2">(started by {impersonation.source_admin_email})</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400/40 text-amber-100 hover:bg-amber-500/20"
          onClick={openAdminNewTab}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open admin in new tab
        </Button>
        {returnError && (
          <span className="text-xs text-amber-200/90 mr-2 max-w-[20rem] truncate" title={returnError}>
            {returnError}
          </span>
        )}
        <Button
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-amber-950"
          onClick={handleReturn}
          disabled={returning}
        >
          {returning ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5 mr-1" />
          )}
          {returnError ? 'Restore Admin Session' : 'Return to admin'}
        </Button>
        {returnError && (
          <Button
            size="sm"
            variant="ghost"
            className="text-amber-100 hover:bg-amber-500/20"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/auth';
            }}
          >
            Sign in as admin
          </Button>
        )}
      </div>
    </div>
  );
}