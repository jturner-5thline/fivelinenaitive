import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { shouldShowSignatureGhost } from '@/components/deal/email/signatureGhost';

/**
 * Lets the signed-in user save a default email signature that the composer
 * (via EmailListAndDetail) will use as ghost-text below the body. Falls back
 * to a derived "Best,\n<name>" when empty.
 */
export function EmailSignatureSettings() {
  const { user } = useAuth();
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
        const sig = (data?.email_signature ?? '') as string;
        setValue(sig);
        setInitial(sig);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const dirty = value !== initial;

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ email_signature: value || null })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to save signature');
      return;
    }
    setInitial(value);
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
  const effectiveSignature = (value && value.trim()) ? value : derivedFallback;
  const previewBody = 'Hi team,\n\nQuick note ahead of our call.';
  const showGhost = shouldShowSignatureGhost(effectiveSignature, previewBody);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email signature</CardTitle>
        <CardDescription>
          Appended as ghost-text below your message in the email composer. Leave
          blank to use the default ("Best, &lt;your name&gt;").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email-signature">Signature</Label>
          <Textarea
            id="email-signature"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={derivedFallback || 'Best,\nYour Name'}
            rows={6}
            disabled={loading}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Plain text. New lines are preserved. HTML is not rendered.
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
            <div className="text-sm whitespace-pre-wrap text-foreground">
              {previewBody}
            </div>
            {showGhost ? (
              <div
                className="text-[11px] text-muted-foreground/60 whitespace-pre-wrap pt-2 border-t border-border/30 mt-2 select-none"
                aria-hidden
              >
                {effectiveSignature}
              </div>
            ) : (
              <div className="text-[11px] italic text-muted-foreground/50 pt-2 border-t border-border/30 mt-2">
                No signature will be shown.
              </div>
            )}
          </div>
          {!value.trim() && derivedFallback && (
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