import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LS_KEY = "naitive-notifications-consent-shown";

/**
 * One-time first-login consent modal asking whether the user wants
 * email notifications. Only shown once per user — guarded by both a
 * profile flag (`notifications_consent_shown`) and a localStorage key.
 * Renders only on /deals.
 */
export function NotificationConsentModal() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    if (location.pathname !== "/deals") return;
    if (localStorage.getItem(LS_KEY) === "1") return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("notifications_consent_shown")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && data.notifications_consent_shown === false) {
        setOpen(true);
      } else {
        localStorage.setItem(LS_KEY, "1");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, location.pathname]);

  const finish = async (optIn: boolean) => {
    if (!user?.id || busy) return;
    setBusy(true);
    try {
      await supabase
        .from("profiles")
        .update({
          notifications_consent_shown: true,
          ...(optIn ? { notifications_opted_in: true } : {}),
        })
        .eq("user_id", user.id);
    } finally {
      localStorage.setItem(LS_KEY, "1");
      setOpen(false);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && finish(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stay in the loop</DialogTitle>
          <DialogDescription>
            Get email updates on deal activity, lender responses, and task reminders.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => finish(false)} disabled={busy}>
            Maybe later
          </Button>
          <Button onClick={() => finish(true)} disabled={busy}>
            Yes, notify me
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}