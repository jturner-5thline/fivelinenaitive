import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Send, Save, X, Mail, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { applyDemoLenderSalutation } from '@/lib/demoLenderSalutation';

interface Recipient {
  name?: string;
  email: string;
}

interface PromptRecord {
  id: string;
  deal_id: string;
  company_id: string;
  workflow_key: string;
  workflow_name: string;
  trigger_reason: string;
  email_template_number: number | null;
  recipients_json: Recipient[];
  cc_json: Recipient[];
  merged_subject: string;
  merged_body_html: string;
  status: string;
  metadata: Record<string, any> | null;
}

const stripHtml = (html: string) =>
  html
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

/**
 * Mounted globally inside App.tsx. Listens for `workflow-email-prompt`
 * window events fired by the email-workflow trigger engine after a deal
 * stage change is persisted, then opens an editable email modal.
 */
export function WorkflowEmailModalListener() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState<PromptRecord | null>(null);
  const [dealName, setDealName] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [ccs, setCcs] = useState<Recipient[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [newCc, setNewCc] = useState('');
  const [busy, setBusy] = useState(false);

  // Per-tab dedup: don't re-open the same prompt id repeatedly
  const seenPromptsRef = useRef<Set<string>>(new Set());

  const loadPrompt = useCallback(async (promptId: string) => {
    if (seenPromptsRef.current.has(promptId)) return;
    seenPromptsRef.current.add(promptId);

    const { data, error } = await supabase
      .from('deal_email_prompts')
      .select('*')
      .eq('id', promptId)
      .maybeSingle();
    if (error || !data) return;
    if ((data as any).status !== 'pending') return;

    const p = data as unknown as PromptRecord;
    // Demo-only: rewrite any "Dear …" greeting in the saved draft to use
    // a deterministic fake lender contact name (seeded off the lender /
    // recipient name) before the user sees the editable body.
    const lenderSeed =
      (p.metadata as any)?.lender_name ||
      (Array.isArray(p.recipients_json) ? p.recipients_json[0]?.name : '') ||
      '';
    setPrompt(p);
    setSubject(p.merged_subject || '');
    setBody(
      stripHtml(applyDemoLenderSalutation(p.merged_body_html || '', lenderSeed, p.company_id)),
    );
    setRecipients(Array.isArray(p.recipients_json) ? p.recipients_json.filter(r => r?.email) : []);
    setCcs(Array.isArray(p.cc_json) ? p.cc_json.filter(r => r?.email) : []);

    // Look up deal name for the modal header
    const { data: deal } = await supabase
      .from('deals')
      .select('company')
      .eq('id', p.deal_id)
      .maybeSingle();
    setDealName((deal as any)?.company || '');
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.promptId) loadPrompt(detail.promptId);
    };
    window.addEventListener('workflow-email-prompt', handler);
    return () => window.removeEventListener('workflow-email-prompt', handler);
  }, [loadPrompt]);

  // Open the OLDEST pending prompt for a deal (used by deal-page auto-open
  // and the email-icon badge click).
  const loadOldestForDeal = useCallback(async (dealId: string) => {
    const { data, error } = await supabase
      .from('deal_email_prompts')
      .select('id')
      .eq('deal_id', dealId)
      .eq('status', 'pending')
      .order('triggered_at', { ascending: true })
      .limit(1);
    if (error || !data || data.length === 0) {
      console.log('[workflow-email-modal] no pending prompt for deal', dealId);
      return;
    }
    const promptId = (data[0] as any).id as string;
    console.log('[workflow-email-modal] auto-opening oldest pending prompt', { dealId, promptId });
    await loadPrompt(promptId);
  }, [loadPrompt]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.dealId) loadOldestForDeal(detail.dealId);
    };
    window.addEventListener('workflow-email-prompt-open-oldest', handler);
    return () => window.removeEventListener('workflow-email-prompt-open-oldest', handler);
  }, [loadOldestForDeal]);

  const close = () => {
    setPrompt(null);
    setBusy(false);
  };

  const logAudit = async (status: 'sent' | 'draft' | 'dismissed', extra: Record<string, any> = {}) => {
    if (!prompt) return;
    try {
      await supabase.from('notification_audit' as any).insert({
        trigger_key: 'workflow_email_prompt',
        recipient_user_id: user?.id || null,
        deal_id: prompt.deal_id,
        channel: 'in_app_modal',
        status,
        title: prompt.workflow_name,
        body: prompt.trigger_reason,
        metadata: {
          prompt_id: prompt.id,
          workflow_id: prompt.workflow_key,
          stage_id: prompt.metadata?.stage_id || null,
          ...extra,
        },
      } as any);
    } catch (err) {
      console.error('[workflow-email-modal] audit insert failed', err);
    }
  };

  const handleDismiss = async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await supabase
        .from('deal_email_prompts')
        .update({
          status: 'dismissed',
          dismissed_at: new Date().toISOString(),
          dismissed_by: user?.id,
        } as any)
        .eq('id', prompt.id);
      await logAudit('dismissed');
      toast.message('Workflow email dismissed');
      close();
    } catch (err) {
      console.error(err);
      toast.error('Failed to dismiss');
      setBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await supabase
        .from('deal_email_prompts')
        .update({
          merged_subject: subject,
          merged_body_html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          recipients_json: recipients,
          cc_json: ccs,
          metadata: { ...(prompt.metadata || {}), saved_as_draft_at: new Date().toISOString() },
        } as any)
        .eq('id', prompt.id);
      await logAudit('draft');
      toast.success('Saved as draft');
      close();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save draft');
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!prompt) return;
    if (recipients.length === 0) {
      toast.error('Add at least one recipient');
      return;
    }
    setBusy(true);
    try {
      const htmlBody = `<p>${body.replace(/\n/g, '<br/>')}</p>`;
      // Dispatch via Gmail/Nylas (existing provider)
      const { error: sendErr } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: recipients.map(r => r.email).filter(Boolean),
          cc: ccs.map(r => r.email).filter(Boolean),
          subject,
          html: htmlBody,
          text: body,
          dealId: prompt.deal_id,
        },
      });
      if (sendErr) throw sendErr;

      // Mark prompt sent
      await supabase
        .from('deal_email_prompts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_by: user?.id,
          merged_subject: subject,
          merged_body_html: htmlBody,
          recipients_json: recipients,
          cc_json: ccs,
        } as any)
        .eq('id', prompt.id);

      // Log to deal timeline
      await supabase.from('activity_logs').insert({
        deal_id: prompt.deal_id,
        user_id: user?.id,
        activity_type: 'email_sent',
        description: `Workflow email sent: ${prompt.workflow_name}`,
        metadata: {
          subject,
          recipients: recipients.map(r => r.email),
          cc: ccs.map(r => r.email),
          prompt_id: prompt.id,
          workflow_id: prompt.workflow_key,
          stage_id: prompt.metadata?.stage_id || null,
        },
      } as any);

      // Mark workflow event as sent (so prevent_duplicate_send works)
      await supabase
        .from('email_workflow_events' as any)
        .update({ status: 'sent', sent_at: new Date().toISOString() } as any)
        .eq('prompt_id', prompt.id);

      await logAudit('sent', { recipient_count: recipients.length, cc_count: ccs.length });
      toast.success('Workflow email sent');
      close();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to send email');
      setBusy(false);
    }
  };

  const addRecipient = (raw: string, into: 'to' | 'cc') => {
    const email = raw.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    if (into === 'to') {
      setRecipients(prev => [...prev, { email }]);
      setNewRecipient('');
    } else {
      setCcs(prev => [...prev, { email }]);
      setNewCc('');
    }
  };

  if (!prompt) return null;

  return (
    <Dialog open={!!prompt} onOpenChange={open => { if (!open && !busy) handleDismiss(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{dealName || 'Deal'}</div>
              <div className="text-xs font-normal text-muted-foreground truncate">
                {prompt.workflow_name}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {prompt.trigger_reason}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Recipients */}
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((r, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {r.email}
                  <button
                    type="button"
                    className="hover:bg-muted rounded-sm p-0.5"
                    onClick={() => setRecipients(prev => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove recipient"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newRecipient}
                onChange={e => setNewRecipient(e.target.value)}
                placeholder="Add recipient email"
                className="h-8 text-xs"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addRecipient(newRecipient, 'to');
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => addRecipient(newRecipient, 'to')}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* CC */}
          <div className="space-y-1.5">
            <Label className="text-xs">CC</Label>
            <div className="flex flex-wrap gap-1.5">
              {ccs.map((r, i) => (
                <Badge key={i} variant="outline" className="gap-1 pr-1">
                  {r.email}
                  <button
                    type="button"
                    className="hover:bg-muted rounded-sm p-0.5"
                    onClick={() => setCcs(prev => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove CC"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCc}
                onChange={e => setNewCc(e.target.value)}
                placeholder="Add CC email"
                className="h-8 text-xs"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addRecipient(newCc, 'cc');
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => addRecipient(newCc, 'cc')}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="min-h-[200px] text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSend} disabled={busy} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
            <Button variant="outline" onClick={handleSaveDraft} disabled={busy} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              Save as Draft
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              disabled={busy}
              className="gap-1.5 ml-auto text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}