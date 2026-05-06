import { useState } from 'react';
import { Video, Zap, GitBranch, ExternalLink, Settings2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CardSurface, StatusPill } from './IntegrationCard';
import { ClaapIntegration } from './ClaapIntegration';
import { ZapierIntegration } from './ZapierIntegration';
import { FlexAutoRemovalRules } from './FlexAutoRemovalRules';
import { useZapierWebhooks } from '@/hooks/useZapierWebhooks';
import { useIntegrations } from '@/hooks/useIntegrations';
import { useFlexSyncSettings } from '@/hooks/useFlexSyncSettings';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

const CLAAP_ALLOWED_EMAILS = new Set(['jturner@5thline.co', 'ffustinoni@5thline.co']);

/* ── Claap ───────────────────────────────────────────────────────────── */
export function ClaapSummaryCard() {
  const { user } = useAuth();
  const { integrations } = useIntegrations();
  const claap = integrations.find((i) => i.type === 'claap');
  const isEnabled = claap?.status === 'connected';
  const canManage = !!user?.email && CLAAP_ALLOWED_EMAILS.has(user.email);
  const [open, setOpen] = useState(false);

  return (
    <>
      <CardSurface>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Video className="h-4 w-4 text-muted-foreground/80 flex-shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight truncate">Claap</h3>
          </div>
          <StatusPill status={isEnabled ? 'connected' : 'disconnected'} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
          Meeting recordings and transcripts routed to deals.
        </p>
        {claap?.last_sync_at && (
          <p className="text-[11px] text-muted-foreground/80 mt-1.5 truncate">
            Synced {formatDistanceToNow(new Date(claap.last_sync_at), { addSuffix: true })}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOpen(true)}
            disabled={!canManage}
          >
            {canManage ? <Settings2 className="h-3 w-3 mr-1.5" /> : <Lock className="h-3 w-3 mr-1.5" />}
            Manage
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" asChild>
            <a href="https://app.claap.io" target="_blank" rel="noopener noreferrer">
              Open Claap
              <ExternalLink className="h-3 w-3 ml-1.5" />
            </a>
          </Button>
        </div>
      </CardSurface>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Claap</SheetTitle>
            <SheetDescription>Sync settings, routing rules, and connection health.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <ClaapIntegration />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ── Zapier ──────────────────────────────────────────────────────────── */
export function ZapierSummaryCard() {
  const { webhooks, isLoading } = useZapierWebhooks();
  const [open, setOpen] = useState(false);
  const activeCount = webhooks.filter((w) => w.is_active).length;

  return (
    <>
      <CardSurface>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-4 w-4 text-muted-foreground/80 flex-shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight truncate">Zapier</h3>
          </div>
          <StatusPill status={activeCount > 0 ? 'connected' : 'disconnected'} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
          Send naitive events to thousands of apps via webhook.
        </p>
        {!isLoading && webhooks.length > 0 && (
          <div className="flex items-center gap-4 mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold tabular-nums">{webhooks.length}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Webhooks</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold tabular-nums">{activeCount}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-3">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
            <Settings2 className="h-3 w-3 mr-1.5" />
            Configure webhooks
          </Button>
        </div>
      </CardSurface>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Zapier webhooks</SheetTitle>
            <SheetDescription>
              Create a Zap with a "Webhooks by Zapier" Catch Hook trigger, paste the URL here, and pick which events to send.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <ZapierIntegration />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ── FLEx auto-removal (automation, not an integration) ───────────────── */
export function FlexAutomationCard({ companyId, canEdit }: { companyId: string | null | undefined; canEdit: boolean }) {
  const { settings } = useFlexSyncSettings(companyId);
  const [open, setOpen] = useState(false);
  const enabledCount = [
    settings.remove_on_due_diligence,
    settings.remove_on_closed_won,
    settings.remove_on_closed_lost,
    settings.remove_on_archived,
  ].filter(Boolean).length;

  return (
    <>
      <CardSurface>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="h-4 w-4 text-muted-foreground/80 flex-shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight truncate">FLEx auto-removal</h3>
          </div>
          <StatusPill status={enabledCount > 0 ? 'connected' : 'disconnected'} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
          Automatically remove deals from FLEx on stage or tag changes.
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-1.5">
          {enabledCount} of 4 triggers enabled
        </p>
        <div className="flex items-center gap-1.5 mt-3">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
            <Settings2 className="h-3 w-3 mr-1.5" />
            Manage rules
          </Button>
        </div>
      </CardSurface>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>FLEx auto-removal rules</SheetTitle>
            <SheetDescription>Triggers fire in real time on stage or tag change.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <FlexAutoRemovalRules companyId={companyId} canEdit={canEdit} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}