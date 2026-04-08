import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, MailX } from 'lucide-react';

type Status = 'loading' | 'valid' | 'already' | 'invalid' | 'success' | 'error';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const data = await res.json();
        if (data.already_unsubscribed) setStatus('already');
        else if (data.valid) setStatus('valid');
        else setStatus('invalid');
      } catch { setStatus('invalid'); }
    })();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (error) throw error;
      setStatus(data?.success ? 'success' : 'error');
    } catch { setStatus('error'); }
    setProcessing(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Validating your request…</p>
          </>
        )}
        {status === 'valid' && (
          <>
            <MailX className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">Unsubscribe</h1>
            <p className="text-muted-foreground">
              Click below to unsubscribe from future email notifications.
            </p>
            <Button onClick={handleUnsubscribe} disabled={processing} size="lg">
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Unsubscribe
            </Button>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">Unsubscribed</h1>
            <p className="text-muted-foreground">
              You have been successfully unsubscribed. You will no longer receive these emails.
            </p>
          </>
        )}
        {status === 'already' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">Already Unsubscribed</h1>
            <p className="text-muted-foreground">
              You've already been unsubscribed from these emails.
            </p>
          </>
        )}
        {(status === 'invalid' || status === 'error') && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">
              {status === 'invalid' ? 'Invalid Link' : 'Something went wrong'}
            </h1>
            <p className="text-muted-foreground">
              {status === 'invalid'
                ? 'This unsubscribe link is invalid or has expired.'
                : 'Please try again later.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
