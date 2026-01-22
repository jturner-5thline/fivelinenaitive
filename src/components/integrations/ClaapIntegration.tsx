import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Video, ExternalLink, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIntegrations } from '@/hooks/useIntegrations';
import { useAuth } from '@/contexts/AuthContext';

const ALLOWED_EMAIL = 'jturner@5thline.co';

export function ClaapIntegration() {
  const { user } = useAuth();
  const { integrations, createIntegration, toggleIntegration, isLoading } = useIntegrations();
  
  const claapIntegration = integrations.find(i => i.type === 'claap');
  const isEnabled = claapIntegration?.status === 'connected';
  const canManage = user?.email === ALLOWED_EMAIL;

  const handleToggle = async (enabled: boolean) => {
    if (!claapIntegration) {
      // Create the integration first
      await createIntegration.mutateAsync({
        name: 'Claap',
        type: 'claap',
        config: {},
      });
      // Then enable it if needed
      if (enabled) {
        // The integration is created as disconnected, need to toggle it
        // This will happen after the mutation completes and refetch
      }
    } else {
      await toggleIntegration.mutateAsync({ id: claapIntegration.id, enabled });
    }
  };

  // Auto-create integration if it doesn't exist when toggling on
  useEffect(() => {
    if (!claapIntegration && createIntegration.isSuccess) {
      // Integration was just created, now enable it
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
        
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <h4 className="font-medium text-sm">About Claap Integration</h4>
          <p className="text-sm text-muted-foreground">
            When enabled, Claap recordings will appear in the Data Room tab of each deal. 
            You can link recordings to specific deals, view meeting transcripts, and see 
            participant information including names and email addresses.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Video className="h-4 w-4" />
              <span>View and search all workspace recordings</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Video className="h-4 w-4" />
              <span>Link recordings to deals for easy reference</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Video className="h-4 w-4" />
              <span>Access meeting transcripts and participant lists</span>
            </div>
          </div>
        </div>
        
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
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <a href="https://app.claap.io" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Claap
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
