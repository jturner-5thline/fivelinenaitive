import { useEffect, useState } from 'react';
import { Loader2, Send, Copy, Check, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealName: string;
  contactName: string;
  contactEmail: string;
  /** Called after a successful send so the cadence clock resets locally. */
  onSent?: () => void;
}

function buildDefaults(contactName: string, dealName: string) {
  const first = (contactName || '').trim().split(/\s+/)[0] || 'there';
  return {
    subject: `Quick check-in on ${dealName}`,
    body:
      `Hi ${first},\n\n` +
      `Just checking in on the ${dealName} process — wanted to see if you have any questions or updates on your end. ` +
      `We're making good progress and will be in touch with updates shortly.\n\n` +
      `Best,`,
  };
}

export function ClientCheckInDraftModal({
  open, onOpenChange, dealId, dealName, contactName, contactEmail, onSent,
}: Props) {
  const defaults = buildDefaults(contactName, dealName);
  const [to, setTo] = useState(contactEmail);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      const d = buildDefaults(contactName, dealName);
      setTo(contactEmail);
      setSubject(d.subject);
      setBody(d.body);
      setCopied(false);
    }
  }, [open, contactEmail, contactName, dealName]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      toast({ title: 'Draft copied to clipboard' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleSend = async () => {
    if (!to.trim()) { toast({ title: 'Recipient required', variant: 'destructive' }); return; }
    if (!subject.trim() || !body.trim()) { toast({ title: 'Subject and body are required', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: { action: 'send', to: [to.trim()], subject: subject.trim(), body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const nowIso = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        deal_id: dealId,
        user_id: user?.id ?? null,
        activity_type: 'client_check_in_sent',
        description: `Client check-in sent to ${contactName || to.trim()} — ${subject.trim()}`,
        metadata: {
          recipient_email: to.trim(),
          recipient_name: contactName || null,
          subject: subject.trim(),
          body_preview: body.trim().slice(0, 160),
          sent_at: nowIso,
          tag: 'Client Check-In Sent',
        },
      });

      toast({ title: 'Check-in sent', description: 'Cadence clock has been reset.' });
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      toast({ title: 'Could not send', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl z-[1310]" overlayClassName="z-[1300]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Check in with {contactName || 'client'}
          </DialogTitle>
          <DialogDescription>
            Review the draft below — you control when it goes out. Sending will reset the cadence clock and log the contact to the deal's activity timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 min-h-[180px] text-sm leading-relaxed" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleCopy} className="gap-1">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending || !to.trim()} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send check-in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}