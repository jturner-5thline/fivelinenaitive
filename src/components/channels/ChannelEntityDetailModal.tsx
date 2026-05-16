import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Network, Loader2 } from 'lucide-react';
import { ContactDetailContent } from '@/components/crm/ContactDetailContent';
import { CompanyDetailContent } from '@/components/crm/CompanyDetailContent';
import { useUpdateChannelEntry, type ChannelType, type ChannelEntry } from '@/hooks/useChannelEntries';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';

const CHANNEL_TYPES: ChannelType[] = CHANNEL_TYPE_OPTIONS.map(o => o.value);

interface Props {
  entry: ChannelEntry;
  onClose: () => void;
}

function ChannelContextCard({ entry, onClose }: { entry: ChannelEntry; onClose: () => void }) {
  const [channelType, setChannelType] = useState<ChannelType>(entry.channel_type);
  const [notes, setNotes] = useState(entry.notes || '');
  const [dirty, setDirty] = useState(false);
  const updateChannel = useUpdateChannelEntry();

  const handleSave = async () => {
    await updateChannel.mutateAsync({ id: entry.id, channel_type: channelType, notes: notes || null });
    setDirty(false);
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Network className="h-4 w-4 text-primary" /> Channel Attribution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Channel</Label>
          <Select value={channelType} onValueChange={(v) => { setChannelType(v as ChannelType); setDirty(true); }}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHANNEL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Referral Source Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            rows={2}
            className="mt-1 text-xs"
            placeholder="Notes about this referral source..."
          />
        </div>
        {dirty && (
          <Button size="sm" className="w-full" onClick={handleSave} disabled={updateChannel.isPending}>
            {updateChannel.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save Channel Info
          </Button>
        )}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{entry.contact_id && entry.crm_company_id ? 'Both' : entry.contact_id ? 'Contact' : 'Company'}</Badge>
          <span>Added {new Date(entry.created_at).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChannelEntityDetailModal({ entry, onClose }: Props) {
  const hasCompany = !!entry.crm_company_id;
  const hasContact = !!entry.contact_id;

  // Determine primary view: prefer company if both exist
  const primaryType = hasCompany ? 'company' : 'contact';
  const primaryId = hasCompany ? entry.crm_company_id! : entry.contact_id!;

  const channelContext = <ChannelContextCard entry={entry} onClose={onClose} />;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent
        className="max-w-[95vw] w-[1400px] max-h-[92vh] p-0 overflow-hidden"
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        <ScrollArea className="max-h-[92vh] p-6">
          {primaryType === 'company' ? (
            <CompanyDetailContent
              companyId={primaryId}
              hideBackButton
              headerExtra={channelContext}
              onDeleted={onClose}
            />
          ) : (
            <ContactDetailContent
              contactId={primaryId}
              hideBackButton
              headerExtra={channelContext}
              onDeleted={onClose}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
