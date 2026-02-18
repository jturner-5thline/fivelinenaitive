import { useState } from 'react';
import { Plus, X, Bell, BellOff, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { NewsAlert } from '@/hooks/useNewsAlerts';
import type { DigestSettings } from '@/hooks/useNewsDigestSettings';

interface AlertsAndDigestPanelProps {
  alerts: NewsAlert[];
  onCreateAlert: (keyword: string) => Promise<void>;
  onUpdateAlert: (id: string, updates: Partial<NewsAlert>) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
  digestSettings: DigestSettings;
  onUpdateDigestSettings: (updates: Partial<DigestSettings>) => Promise<void>;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function AlertsAndDigestPanel({
  alerts,
  onCreateAlert,
  onUpdateAlert,
  onDeleteAlert,
  digestSettings,
  onUpdateDigestSettings,
}: AlertsAndDigestPanelProps) {
  const [newKeyword, setNewKeyword] = useState('');

  const handleAddAlert = async () => {
    if (!newKeyword.trim()) return;
    await onCreateAlert(newKeyword.trim());
    setNewKeyword('');
  };

  return (
    <div className="space-y-6">
      {/* Keyword Alerts */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Keyword Alerts
        </h3>
        <p className="text-xs text-muted-foreground">
          Get notified when articles match your keywords.
        </p>
        <div className="flex gap-2">
          <Input
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            placeholder="e.g., term sheet, ABL..."
            className="h-8"
            onKeyDown={e => e.key === 'Enter' && handleAddAlert()}
          />
          <Button variant="outline" size="sm" className="h-8" onClick={handleAddAlert}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1.5">
          {alerts.map(alert => (
            <Card key={alert.id} className="p-2 flex items-center justify-between">
              <span className="text-sm font-medium">{alert.keyword}</span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={alert.is_active}
                  onCheckedChange={(checked) => onUpdateAlert(alert.id, { is_active: checked })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteAlert(alert.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
          {alerts.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No alerts configured.</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Email Digest */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Digest
          </h3>
          <Switch
            checked={digestSettings.is_enabled}
            onCheckedChange={(checked) => onUpdateDigestSettings({ is_enabled: checked })}
          />
        </div>
        {digestSettings.is_enabled && (
          <div className="space-y-3 pl-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select
                  value={digestSettings.frequency}
                  onValueChange={(v) => onUpdateDigestSettings({ frequency: v as 'daily' | 'weekly' })}
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {digestSettings.frequency === 'weekly' && (
                <div>
                  <Label className="text-xs">Day</Label>
                  <Select
                    value={String(digestSettings.preferred_day)}
                    onValueChange={(v) => onUpdateDigestSettings({ preferred_day: Number(v) })}
                  >
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day, i) => (
                        <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Max Articles</Label>
              <Select
                value={String(digestSettings.max_articles)}
                onValueChange={(v) => onUpdateDigestSettings({ max_articles: Number(v) })}
              >
                <SelectTrigger className="h-8 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} articles</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
