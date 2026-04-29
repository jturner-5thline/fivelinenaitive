import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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