import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Video, ExternalLink, Lock, FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIntegrations } from '@/hooks/useIntegrations';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClaapSyncSettings } from './ClaapSyncSettings';

const ALLOWED_EMAILS = new Set(['jturner@5thline.co', 'ffustinoni@5thline.co']);

export function ClaapIntegration() {
  const { user } = useAuth();
  const { integrations, createIntegration, toggleIntegration, isLoading } = useIntegrations();
  const [testingWebhook, setTestingWebhook] = useState(false);
  
  const claapIntegration = integrations.find(i => i.type === 'claap');
  const isEnabled = claapIntegration?.status === 'connected';
  const canManage = user?.email === ALLOWED_EMAIL;

  const handleToggle = async (enabled: boolean) => {
    if (!claapIntegration) {
      await createIntegration.mutateAsync({
        name: 'Claap',
        type: 'claap',
        config: {},
      });
      if (enabled) {
        // The integration is created as disconnected, need to toggle it
      }
    } else {
      await toggleIntegration.mutateAsync({ id: claapIntegration.id, enabled });
    }
  };

  const handleSendTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      const mockPayload = {
        event: 'recording.completed',
        data: {
          id: `test-${Date.now()}`,
          title: 'Test Company <> 5th Line Financing Review',
          url: 'https://app.claap.io/test-recording',
          videoUrl: 'https://app.claap.io/test-recording/video',
          durationSeconds: 1800,
          createdAt: new Date().toISOString(),
          recorder: {
            email: user?.email || 'test@5thline.co',
            name: 'Test User',
          },
          meeting: {
            participants: [
              { name: 'Test User', email: user?.email || 'test@5thline.co', attended: true },
              { name: 'External Contact', email: 'contact@testcompany.com', attended: true },
            ],
            startingAt: new Date(Date.now() - 1800000).toISOString(),
            endingAt: new Date().toISOString(),
          },
        },
      };

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/claap-webhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockPayload),
        }
      );

      const result = await response.json();
      
      if (result.ok) {
        toast.success('Test webhook sent successfully', {
          description: `Meeting ID: ${result.meeting_id} | Status: ${result.status} | Tasks: ${result.tasks_created || 0}`,
        });
      } else {
        toast.error('Test webhook failed', { description: result.error || 'Unknown error' });
      }
    } catch (err: any) {
      toast.error('Failed to send test webhook', { description: err.message });
    } finally {
      setTestingWebhook(false);
    }
  };

  // Auto-create integration if it doesn't exist when toggling on
  useEffect(() => {
    if (!claapIntegration && createIntegration.isSuccess) {
      const newIntegration = integrations.find(i => i.type === 'claap');
      if (newIntegration && newIntegration.status !== 'connected') {
        toggleIntegration.mutate({ id: newIntegration.id, enabled: true });
      }
    }
  }, [claapIntegration, createIntegration.isSuccess, integrations, toggleIntegration]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Video className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Claap</CardTitle>
              <CardDescription>Video meeting recordings and transcripts</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isEnabled ? 'default' : 'secondary'}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {canManage ? (
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={isLoading || createIntegration.isPending || toggleIntegration.isPending}
              />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Only authorized administrators can manage this integration.
            </p>
          </div>
        )}
        
        {!isEnabled && canManage && (
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Video className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Claap integration is disabled</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Enable this integration to view Claap recordings in your deals
            </p>
            <Button onClick={() => handleToggle(true)} disabled={createIntegration.isPending || toggleIntegration.isPending}>
              Enable Claap
            </Button>
          </div>
        )}
        
        {!isEnabled && !canManage && (
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Video className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Claap integration is disabled</p>
            <p className="text-sm text-muted-foreground mt-1">
              Contact an administrator to enable this integration
            </p>
          </div>
        )}

        {isEnabled && (
          <div className="space-y-4">
            {/* Top row: About + Actions side by side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">About Claap Integration</h4>
                <p className="text-sm text-muted-foreground">
                  Claap recordings appear in the Data Room tab of each deal. Link recordings to deals, view transcripts, and see participant information.
                </p>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><Video className="h-3.5 w-3.5" /><span>View and search all recordings</span></div>
                  <div className="flex items-center gap-2"><Video className="h-3.5 w-3.5" /><span>Link recordings to deals</span></div>
                  <div className="flex items-center gap-2"><Video className="h-3.5 w-3.5" /><span>Access transcripts and participants</span></div>
                </div>
              </div>
              <div className="flex flex-col gap-3 justify-between">
                <div className="bg-muted/50 rounded-lg p-4 flex-1">
                  <h4 className="font-medium text-sm mb-2">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSendTestWebhook}
                        disabled={testingWebhook}
                      >
                        {testingWebhook ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FlaskConical className="h-4 w-4 mr-2" />
                        )}
                        Send Test Webhook
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://app.claap.io" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Claap
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {/* Sync settings in 2-column layout */}
            <ClaapSyncSettings />
          </div>
        )}
      </CardContent>
    </Card>
  );
}