import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Settings2,
  ExternalLink,
  Loader2,
  Bell,
  Check,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

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

/**
 * Quiet, low-contrast status pill for the redesigned Integrations page.
 * Avoids saturated fills, glow, or hover state changes.
 */
export function StatusPill({ status }: { status: IntegrationStatus }) {
  const map: Record<IntegrationStatus, { label: string; dot: string; text: string }> = {
    connected:        { label: 'Connected',  dot: 'bg-emerald-400/80',  text: 'text-emerald-300/90' },
    requires_reauth:  { label: 'Attention',  dot: 'bg-amber-400/80',    text: 'text-amber-300/90' },
    error:            { label: 'Error',      dot: 'bg-rose-400/80',     text: 'text-rose-300/90' },
    disconnected:     { label: 'Inactive',   dot: 'bg-muted-foreground/60', text: 'text-muted-foreground' },
  };
  const s = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', s.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

/* Shared surface used by every card on the Integrations page. Subtle contrast,
   no thick borders, no glow, single hairline divider. */
function CardSurface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-card/40 border border-border/40 px-5 py-4 transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}
export { CardSurface };

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
      <CardSurface className="hover:border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground/80 flex-shrink-0" />
              <h3 className="text-sm font-semibold tracking-tight truncate">{name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onConnect}>
            Connect
          </Button>
        </div>
      </CardSurface>
    );
  }

  const hasOverflow = !!onTestConnection || !!onDisconnect;

  return (
    <>
      <CardSurface>
        {/* Top row: icon + name on the left, status on the right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-muted-foreground/80 flex-shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight truncate">{name}</h3>
          </div>
          <StatusPill status={status} />
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{description}</p>

        {/* Metadata row: account/email + last sync. Compact, single line. */}
        {(statusDetail || lastSynced) && (
          <p className="text-[11px] text-muted-foreground/80 mt-1.5 truncate">
            {statusDetail}
            {statusDetail && lastSynced ? ' · ' : ''}
            {lastSynced && `Synced ${formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}`}
          </p>
        )}

        {/* Compact metrics, only when present */}
        {recordCounts && recordCounts.length > 0 && (
          <div className="flex items-center gap-4 mt-2.5">
            {recordCounts.map((rc) => (
              <div key={rc.label} className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold tabular-nums">{rc.count.toLocaleString()}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{rc.label}</span>
              </div>
            ))}
          </div>
        )}

        {children}

        {/* Action row: at most one primary, one secondary, plus overflow */}
        {(onSyncSettings || externalUrl || hasOverflow) && (
          <div className="flex items-center gap-1.5 mt-3">
            {onSyncSettings && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSyncSettings}>
                <Settings2 className="h-3 w-3 mr-1.5" />
                Manage
              </Button>
            )}
            {externalUrl && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" asChild>
                <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                  {externalLabel || `Open ${name}`}
                  <ExternalLink className="h-3 w-3 ml-1.5" />
                </a>
              </Button>
            )}
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {onTestConnection && (
                    <DropdownMenuItem onClick={handleTest} disabled={isTesting}>
                      {isTesting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                      Test connection
                    </DropdownMenuItem>
                  )}
                  {onDisconnect && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(e) => { e.preventDefault(); setShowDisconnectDialog(true); }}
                    >
                      Disconnect
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </CardSurface>

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
    <CardSurface className="opacity-70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
            <h3 className="text-sm font-medium text-muted-foreground truncate">{name}</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Soon</span>
          </div>
          <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">{description}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={onNotifyMe}
          disabled={isNotified || isNotifying}
        >
          {isNotifying ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : isNotified ? (
            <Check className="h-3 w-3 mr-1.5" />
          ) : (
            <Bell className="h-3 w-3 mr-1.5" />
          )}
          {isNotified ? 'Notified' : 'Notify me'}
        </Button>
      </div>
    </CardSurface>
  );
}
