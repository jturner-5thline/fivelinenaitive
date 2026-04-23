import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Settings2,
  ExternalLink,
  RefreshCw,
  Unplug,
  Play,
  Loader2,
  Bell,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export type IntegrationStatus = 'connected' | 'error' | 'requires_reauth' | 'disconnected';

export interface IntegrationCardProps {
  name: string;
  icon: LucideIcon;
  description: string;
  status: IntegrationStatus;
  lastSynced?: string | null;
  recordCounts?: { label: string; count: number }[];
  externalUrl?: string;
  externalLabel?: string;
  onSyncSettings?: () => void;
  onTestConnection?: () => Promise<void>;
  onDisconnect?: () => Promise<void>;
  onConnect?: () => void;
  isConnected: boolean;
  statusDetail?: string;
  children?: React.ReactNode;
}

export interface ComingSoonCardProps {
  name: string;
  icon: LucideIcon;
  description: string;
  isNotified: boolean;
  onNotifyMe: () => void;
  isNotifying?: boolean;
}

function StatusPill({ status }: { status: IntegrationStatus }) {
  switch (status) {
    case 'connected':
      return (
        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5" />
          Connected
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive-foreground mr-1.5" />
          Error
        </Badge>
      );
    case 'requires_reauth':
      return (
        <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mr-1.5" />
          Requires Reauth
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground mr-1.5" />
          Disconnected
        </Badge>
      );
  }
}

export function IntegrationCard({
  name,
  icon: Icon,
  description,
  status,
  lastSynced,
  recordCounts,
  externalUrl,
  externalLabel,
  onSyncSettings,
  onTestConnection,
  onDisconnect,
  onConnect,
  isConnected,
  statusDetail,
  children,
}: IntegrationCardProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleTest = async () => {
    if (!onTestConnection) return;
    setIsTesting(true);
    try {
      await onTestConnection();
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!onDisconnect) return;
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
    }
  };

  if (!isConnected && onConnect) {
    return (
      <Card className="hover:border-primary/50 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">{name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              <Button size="sm" className="mt-3" onClick={onConnect}>
                Connect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{name}</h3>
                  <StatusPill status={status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
                {statusDetail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{statusDetail}</p>
                )}

                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  {lastSynced && (
                    <span className="text-xs text-muted-foreground">
                      Last synced: {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
                    </span>
                  )}
                  {recordCounts && recordCounts.length > 0 && (
                    <div className="flex items-center gap-3">
                      {recordCounts.map((rc) => (
                        <span key={rc.label} className="text-xs text-muted-foreground">
                          {rc.count} {rc.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {children}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {onSyncSettings && (
              <Button variant="outline" size="sm" onClick={onSyncSettings}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Sync Settings
              </Button>
            )}
            {onTestConnection && (
              <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
                {isTesting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                Test Connection
              </Button>
            )}
            {onDisconnect && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDisconnectDialog(true)}
              >
                <Unplug className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            )}
            {externalUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                  {externalLabel || `Open ${name}`}
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection to {name}. Your synced data will remain in naitive but will no longer update.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisconnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ComingSoonCard({ name, icon: Icon, description, isNotified, onNotifyMe, isNotifying }: ComingSoonCardProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="opacity-55 border-muted">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">{name}</h3>
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/10 text-[10px]">
                      Coming Soon
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={onNotifyMe}
                    disabled={isNotified || isNotifying}
                  >
                    {isNotifying ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : isNotified ? (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {isNotified ? "You'll be notified" : 'Notify Me'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent>
          <p>This integration is on our roadmap. Click &quot;Notify Me&quot; to be alerted when it launches.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
