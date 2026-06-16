import { useEffect, useState } from 'react';
import { ShieldAlert, LogOut, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  captureImpersonationFromHash,
  readActiveImpersonation,
  stopImpersonation,
  type ImpersonationActiveState,
} from '@/lib/adminImpersonation';

/**
 * Persistent, platform-wide banner shown while an admin is viewing the app
 * as a demo user. Stays visible on every page so actions are never taken
 * accidentally under the wrong identity.
 */
export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationActiveState | null>(null);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    // First, capture from the magic-link landing hash (only fires once).
    const captured = captureImpersonationFromHash();
    setState(captured ?? readActiveImpersonation());
    if (captured) {
      try {
        document.title = `[Demo: ${captured.target_email}] ${document.title}`;
      } catch { /* ignore */ }
    }
    const onStorage = () => setState(readActiveImpersonation());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!state) return null;

  const handleReturn = async () => {
    setReturning(true);
    const { returnTo } = await stopImpersonation();
    if (returnTo) {
      window.location.href = returnTo;
    } else {
      // No admin snapshot in this tab — send to login so admin can sign in.
      window.location.href = '/auth';
    }
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
          <span className="text-amber-100">{state.target_email}</span>
          {state.admin_email && (
            <span className="text-amber-200/70 ml-2">(admin: {state.admin_email})</span>
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
          Return to admin
        </Button>
      </div>
    </div>
  );
}