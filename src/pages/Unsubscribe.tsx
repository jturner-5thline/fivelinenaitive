import { MailX } from 'lucide-react';

/**
 * Legacy unsubscribe landing page. Email preferences are now handled by our
 * managed email provider — the unsubscribe link in recent emails opens the
 * hosted opt-out page directly, so there is no token flow left in the app.
 */
export default function Unsubscribe() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-5">
        <MailX className="h-12 w-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-semibold text-foreground">Manage email preferences</h1>
        <p className="text-muted-foreground">
          This unsubscribe link is from an older email. To opt out, please use the
          unsubscribe link at the bottom of any recent email you received from us —
          it will take you straight to the opt-out page.
        </p>
      </div>
    </div>
  );
}
