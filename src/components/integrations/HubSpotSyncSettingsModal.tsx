import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { HubSpotDealSync } from './hubspot/HubSpotDealSync';
import { HubSpotMappingOverview } from './hubspot/HubSpotMappingOverview';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface HubSpotSyncSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function HubSpotSyncSettingsModal({ open, onClose }: HubSpotSyncSettingsModalProps) {
  const [syncScope, setSyncScope] = useState({
    contacts: true,
    deals: true,
    companies: true,
    activities: true,
  });
  const [syncDirection, setSyncDirection] = useState('one-way');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[700px] flex flex-col max-h-[85vh] p-0 gap-0">
        <DialogHeader className="shrink-0 p-6 pb-4">
          <DialogTitle>HubSpot Sync Settings</DialogTitle>
          <DialogDescription>
            Configure what data syncs between HubSpot and naitive.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-6 px-6">
          {/* Sync Scope */}
          <div>
            <h4 className="text-sm font-medium mb-3">Sync Scope</h4>
            <div className="space-y-2">
              {Object.entries(syncScope).map(([key, checked]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`scope-${key}`}
                    checked={checked}
                    onCheckedChange={(v) => setSyncScope((prev) => ({ ...prev, [key]: !!v }))}
                  />
                  <Label htmlFor={`scope-${key}`} className="text-sm capitalize">{key}</Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Sync Direction */}
          <div>
            <h4 className="text-sm font-medium mb-3">Sync Direction</h4>
            <RadioGroup value={syncDirection} onValueChange={setSyncDirection}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="one-way" id="dir-oneway" />
                <Label htmlFor="dir-oneway" className="text-sm">One-way: HubSpot → naitive (recommended)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="two-way" id="dir-twoway" />
                <Label htmlFor="dir-twoway" className="text-sm">Two-way</Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Object Mapping Configuration */}
          <HubSpotMappingOverview />

          <Separator />

          {/* Stage Mapping + Deal Import */}
          <div>
            <h4 className="text-sm font-medium mb-3">Stage Mapping & Deal Import</h4>
            <HubSpotDealSync />
          </div>

          <Separator />

          {/* Data Usage Note */}
          <div className="rounded-lg border border-border/50 p-3 bg-muted/30 mb-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              <strong>Data Usage:</strong> naitive uses your HubSpot data to power deal analysis, scoring, and workflow automation. To add, edit, or manage CRM records, open HubSpot directly.
            </p>
            <Link to="/field-layout-editor" className="text-xs text-primary flex items-center gap-1 hover:underline">
              <ExternalLink className="h-3 w-3" /> Configure Field Layout Editor
            </Link>
          </div>
        </div>

        <DialogFooter className="shrink-0 p-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
