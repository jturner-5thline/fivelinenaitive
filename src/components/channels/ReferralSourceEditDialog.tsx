import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';

const CHANNEL_PRESETS = CHANNEL_TYPE_OPTIONS.map((o) => o.value as string);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The referral source name as it appears on deals (referred_by). */
  referredBy: string;
  /** Initial company suggestion (from channel match). */
  initialCompany?: string | null;
  onSaved?: () => void;
}

export function ReferralSourceEditDialog({ open, onOpenChange, referredBy, initialCompany, onSaved }: Props) {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [recordCompanyId, setRecordCompanyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [channelChoice, setChannelChoice] = useState<string>('');
  const [channelOther, setChannelOther] = useState('');

  useEffect(() => {
    if (!open || !company?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const escaped = referredBy.replace(/[\\%_]/g, (m) => '\\' + m);
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, company, channel, company_id')
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .ilike('name', escaped)
        .order('company_id', { ascending: false, nullsFirst: false })
        .limit(1);
      const row = data && data.length ? data[0] : null;
      if (cancelled) return;
      if (error && error.code !== 'PGRST116') {
        toast.error(error.message);
      }
      if (row) {
        setRecordId(row.id);
        setRecordCompanyId(row.company_id ?? null);
        setName(row.name || referredBy);
        setCompanyName(row.company || initialCompany || '');
        const ch = row.channel || '';
        if (ch && !CHANNEL_PRESETS.includes(ch)) {
          setChannelChoice('Other');
          setChannelOther(ch);
        } else {
          setChannelChoice(ch);
          setChannelOther('');
        }
      } else {
        setRecordId(null);
        setRecordCompanyId(null);
        setName(referredBy);
        setCompanyName(initialCompany || '');
        setChannelChoice('');
        setChannelOther('');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, company?.id, referredBy, initialCompany]);

  const handleSave = async () => {
    if (!company?.id) return;
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const channelValue =
      channelChoice === 'Other'
        ? channelOther.trim() || null
        : channelChoice || null;

    try {
      if (recordId) {
        const updatePayload: Record<string, any> = {
          name: name.trim(),
          company: companyName.trim() || null,
          channel: channelValue,
        };
        if (!recordCompanyId) updatePayload.company_id = company.id;
        const { error } = await supabase
          .from('referral_sources')
          .update(updatePayload)
          .eq('id', recordId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('referral_sources')
          .insert({
            company_id: company.id,
            user_id: user?.id || null,
            name: name.trim(),
            company: companyName.trim() || null,
            channel: channelValue,
            type: 'Other',
          });
        if (error) throw error;
      }
      toast.success('Referral source updated');
      qc.invalidateQueries({ queryKey: ['referral_source_records'] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Referral Source</DialogTitle>
          <DialogDescription>Update the name, company, and channel for this referral source.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rs-name" className="text-xs">Referral Source Name</Label>
            <Input id="rs-name" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-company" className="text-xs">Company</Label>
            <Input
              id="rs-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={loading}
              placeholder="e.g. Acme Capital"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={channelChoice} onValueChange={setChannelChoice} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPE_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {channelChoice === 'Other' && (
              <Input
                value={channelOther}
                onChange={(e) => setChannelOther(e.target.value)}
                placeholder="Specify channel"
                className="mt-2"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}