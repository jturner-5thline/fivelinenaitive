import { useState } from "react";
import { AlertTriangle, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  // Don't show if user is verified, dismissed, or no user
  if (!user || user.email_confirmed_at || dismissed) {
    return null;
  }

  const handleResendVerification = async () => {
    if (!user.email) return;
    
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      toast.success("Verification email sent! Check your inbox.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send verification email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground">
            Verify your email address
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            Please verify your email ({user.email}) to secure your account and access all features.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handleResendVerification}
            disabled={sending}
          >
            <Mail className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Resend verification email"}
          </Button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
