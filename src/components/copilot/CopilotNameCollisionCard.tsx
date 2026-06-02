import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Pencil, Copy, X, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Renders the "duplicate deal name detected" collision card emitted by the
 * copilot-chat `create_deal` tool. Wired into the existing chip-click
 * dispatcher so each action re-fires through the normal Copilot send loop.
 *
 * Action contract:
 *   { action: 'confirm', action_type: 'name_collision',
 *     description, params: { proposed, existing[] } }
 *
 *   proposed = { name, value, manager_id, manager_name, company_name,
 *                pipeline_id, pipeline_name, stage_id, stage_label,
 *                contact_name, contact_email, notes }
 *   existing[] = { id, name, value, stage, manager_name, company_id, updated_at }
 */

interface ExistingDeal {
  id: string;
  name: string;
  value: number | null;
  stage: string | null;
  manager_name: string | null;
  company_id?: string | null;
  updated_at?: string | null;
}

interface Proposed {
  name: string;
  value: number | null;
  manager_id?: string | null;
  manager_name?: string | null;
  company_name?: string;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  stage_id?: string | null;
  stage_label?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  notes?: string | null;
}

interface Props {
  action: {
    action_type: string;
    description?: string;
    params: { proposed: Proposed; existing: ExistingDeal[] };
  };
}

function formatUSD(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
  return `$${v.toLocaleString()}`;
}

function relativeTime(iso?: string | null) {
  if (!iso) return '';
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ''; }
}

function dispatchPrompt(prompt: string) {
  window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt } }));
}

export function CopilotNameCollisionCard({ action }: Props) {
  const { proposed, existing } = action.params || ({} as any);
  const safeExisting: ExistingDeal[] = Array.isArray(existing) ? existing : [];
  const [mode, setMode] = useState<'choose' | 'rename' | 'pick' | 'done'>('choose');
  const [renameValue, setRenameValue] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(safeExisting[0]?.id || null);
  const [doneLabel, setDoneLabel] = useState<string>('');

  const proposedName = proposed?.name || proposed?.company_name || '';
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (proposed?.value) parts.push(`$${formatUSD(proposed.value).replace('$', '')}`);
    if (proposed?.manager_name) parts.push(`mgr: ${proposed.manager_name}`);
    if (proposed?.pipeline_name) parts.push(proposed.pipeline_name);
    if (proposed?.stage_label) parts.push(proposed.stage_label);
    return parts.join(' · ');
  }, [proposed]);

  function buildUpdatePrompt(target: ExistingDeal): string {
    const bits: string[] = [];
    if (proposed?.value != null) bits.push(`set value to ${proposed.value}`);
    if (proposed?.manager_name) bits.push(`set deal manager to ${proposed.manager_name}`);
    if (proposed?.stage_label) bits.push(`set stage to "${proposed.stage_label}"`);
    if (proposed?.contact_name) bits.push(`add contact ${proposed.contact_name}`);
    if (proposed?.notes) bits.push(`add note: "${proposed.notes}"`);
    const change = bits.length ? bits.join(', ') : 'apply the proposed updates';
    return `Update the existing deal "${target.name}" (id: ${target.id}) — ${change}. Use update_deal_fields and show the FIELD/VALUE/STATUS draft preview.`;
  }

  function buildForceDuplicatePrompt(): string {
    return `Re-run create_deal for "${proposedName}" with force_create=true (the user confirmed they want a duplicate)${proposed?.pipeline_name ? ` in pipeline "${proposed.pipeline_name}"` : ''}${proposed?.value ? ` for $${proposed.value}` : ''}${proposed?.manager_name ? ` managed by ${proposed.manager_name}` : ''}. Do not run the collision pre-check again.`;
  }

  function buildRenamePrompt(newName: string): string {
    return `Create the deal but use the name "${newName}" instead of "${proposedName}"${proposed?.pipeline_name ? ` in pipeline "${proposed.pipeline_name}"` : ''}${proposed?.value ? ` for $${proposed.value}` : ''}${proposed?.manager_name ? ` managed by ${proposed.manager_name}` : ''}.`;
  }

  function handleUpdateExisting() {
    if (safeExisting.length === 1) {
      dispatchPrompt(buildUpdatePrompt(safeExisting[0]));
      setDoneLabel(`Updating "${safeExisting[0].name}"…`);
      setMode('done');
    } else {
      setMode('pick');
    }
  }
  function confirmPick() {
    const target = safeExisting.find((d) => d.id === pickedId);
    if (!target) return;
    dispatchPrompt(buildUpdatePrompt(target));
    setDoneLabel(`Updating "${target.name}"…`);
    setMode('done');
  }
  function handleDuplicate() {
    dispatchPrompt(buildForceDuplicatePrompt());
    setDoneLabel(`Creating duplicate "${proposedName}"…`);
    setMode('done');
  }
  function submitRename() {
    const v = renameValue.trim();
    if (!v) return;
    dispatchPrompt(buildRenamePrompt(v));
    setDoneLabel(`Creating "${v}"…`);
    setMode('done');
  }

  return (
    <Card className="my-2 border-destructive/40 bg-destructive/5" data-testid="copilot-name-collision-card">
      <CardContent className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} style={{ color: 'hsl(var(--destructive))', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div className="text-sm font-semibold">A deal named “{proposedName}” already exists</div>
            {summary && (
              <div className="mt-1 text-xs text-muted-foreground">
                You wanted to create: {summary}
              </div>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">Collision</Badge>
      </div>

      <div className="flex flex-col gap-2">
        {safeExisting.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 rounded-md border border-border/70 bg-background/40 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              <strong className="font-semibold">{d.name}</strong>
              {d.stage ? <span className="opacity-70"> — {d.stage}</span> : null}
              <span className="opacity-70"> — {formatUSD(d.value)}</span>
              {d.manager_name ? <span className="opacity-70"> — mgr: {d.manager_name}</span> : null}
              {d.updated_at ? <span className="opacity-50"> · updated {relativeTime(d.updated_at)}</span> : null}
            </div>
            <Link
              to={`/deals/${d.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-primary no-underline"
            >
              View <ExternalLink size={11} />
            </Link>
          </div>
        ))}
      </div>

      {mode === 'choose' && (
        <div className="flex flex-wrap gap-2">
          <CardButton onClick={handleUpdateExisting} icon={<Pencil size={12} />} label="Update existing" tone="primary" />
          <CardButton onClick={handleDuplicate} icon={<Copy size={12} />} label="Create duplicate" />
          <CardButton onClick={() => setMode('rename')} icon={<Pencil size={12} />} label="Rename" />
          <CardButton onClick={() => { setDoneLabel('Cancelled'); setMode('done'); }} icon={<X size={12} />} label="Cancel" tone="ghost" />
        </div>
      )}

      {mode === 'pick' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
            Pick which existing deal to update:
          </div>
          {safeExisting.map((d) => (
            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="radio"
                name="collision-pick"
                checked={pickedId === d.id}
                onChange={() => setPickedId(d.id)}
              />
              <span>{d.name} — {d.stage || '—'} — {formatUSD(d.value)}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <CardButton onClick={confirmPick} icon={<Check size={12} />} label="Open update draft" tone="primary" />
            <CardButton onClick={() => setMode('choose')} icon={<X size={12} />} label="Back" tone="ghost" />
          </div>
        </div>
      )}

      {mode === 'rename' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setMode('choose'); }}
            placeholder={`New name (was "${proposedName}")`}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--glass-border)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--foreground)',
            }}
          />
          <CardButton onClick={submitRename} icon={<Check size={12} />} label="Create" tone="primary" />
          <CardButton onClick={() => setMode('choose')} icon={<X size={12} />} label="Back" tone="ghost" />
        </div>
      )}

      {mode === 'done' && (
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
          {doneLabel}
        </div>
      )}
      </CardContent>
    </Card>
  );
}

function CardButton({
  onClick, icon, label, tone = 'default',
}: { onClick: () => void; icon: React.ReactNode; label: string; tone?: 'primary' | 'default' | 'ghost' }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={tone === 'primary' ? 'default' : tone === 'ghost' ? 'ghost' : 'outline'}
      onClick={onClick}
      className="h-8 rounded-full px-3 text-xs"
    >
      {icon}
      {label}
    </Button>
  );
}
