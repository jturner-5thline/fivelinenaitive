import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { EmailRichTextEditor } from '@/components/deal/email/EmailRichTextEditor';
import {
  signatureToHtml,
  sanitizeSignatureHtml,
  isHtmlSignature,
} from '@/components/deal/email/signatureHtml';

/**
 * Lets the signed-in user save a rich-text default email signature. The
 * composer and AI draft pipeline read this value and render it as HTML below
 * the message. Falls back to a derived "Best, <name>" when empty.
 */
export function EmailSignatureSettings() {
  const { user } = useAuth();
  // `value` is always HTML inside the editor; we migrate legacy plain-text on load.
  const [value, setValue] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('email_signature')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error('Failed to load signature');
      } else {
        const raw = (data?.email_signature ?? '') as string;
        // Migrate legacy plain-text signatures into HTML so the RTE renders them.
        const html = raw ? (isHtmlSignature(raw) ? sanitizeSignatureHtml(raw) : signatureToHtml(raw)) : '';
        setValue(html);
        setInitial(html);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const isEmptyHtml = (html: string) => {
    if (!html) return true;
    const stripped = html.replace(/<\/?[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    return stripped.length === 0;
  };

  const dirty = value !== initial;

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const toSave = isEmptyHtml(value) ? null : sanitizeSignatureHtml(value);
    const { error } = await supabase
      .from('profiles')
      .update({ email_signature: toSave })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to save signature');
      return;
    }
    setInitial(toSave || '');
    if (toSave) setValue(toSave);
    toast.success('Signature saved');
  };

  const derivedFallback = (() => {
    const name =
      (user?.user_metadata as any)?.full_name ||
      (user?.user_metadata as any)?.name ||
      (user?.email ? user.email.split('@')[0] : '');
    return name ? `Best,\n${name}` : '';
  })();

  // The composer uses the saved signature when set, otherwise the derived
  // fallback. Mirror that here so the preview is accurate before saving.
  const effectiveSignatureHtml = !isEmptyHtml(value)
    ? sanitizeSignatureHtml(value)
    : signatureToHtml(derivedFallback);
  const previewBodyHtml = '<p>Hi team,</p><p><br/></p><p>Quick note ahead of our call.</p>';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email signature</CardTitle>
        <CardDescription>
          Appended below your message in every outgoing email. Supports rich
          formatting, links, and inline images. Leave blank to use the default
          ("Best, &lt;your name&gt;").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email-signature">Signature</Label>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground border rounded-md">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading…
            </div>
          ) : (
            <EmailRichTextEditor
              content={value}
              onChange={setValue}
              minHeight={200}
              placeholder={'Type your signature… (e.g. Best,\nYour Name)'}
              uploadBucket="email-signatures"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Rich text. Use the toolbar to add formatting, links, dividers, or inline images (≤2MB).
          </p>
        </div>

        {/* Live preview — mirrors EmailComposerCard's body + ghost styling */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Preview
            </Label>
            {dirty && (
              <span className="text-[10px] text-muted-foreground">Unsaved changes</span>
            )}
          </div>
          <div className="rounded-md border bg-background px-4 py-3">
            <div
              className="prose prose-sm max-w-none text-sm text-foreground"
              dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
            />
            {effectiveSignatureHtml ? (
              <div className="pt-2 border-t border-border/30 mt-2">
                <div
                  className="prose prose-sm max-w-none text-sm text-foreground signature-preview"
                  dangerouslySetInnerHTML={{ __html: effectiveSignatureHtml }}
                />
              </div>
            ) : (
              <div className="text-[11px] italic text-muted-foreground/50 pt-2 border-t border-border/30 mt-2">
                No signature will be shown.
              </div>
            )}
          </div>
          {isEmptyHtml(value) && derivedFallback && (
            <p className="text-[11px] text-muted-foreground">
              Showing the default derived from your account. Type above to override.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => setValue(initial)}
              disabled={saving}
            >
              Reset
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving || loading}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}