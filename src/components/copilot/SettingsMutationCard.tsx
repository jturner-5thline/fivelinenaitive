import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Edit3, ExternalLink, Loader2, Settings as SettingsIcon, Undo2, X } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useSettingsMutation, type SettingsProposal } from '@/hooks/useSettingsMutation';

interface Props {
  proposal: SettingsProposal;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

/**
 * Settings Mutation Card — rendered inline in the Ask-AI bar response stream
 * when the copilot proposes a change to a configured setting. Admin-gated;
 * non-admins receive a plain explainer + deep link instead of this card.
 */
export function SettingsMutationCard({ proposal }: Props) {
  const { isAdmin } = useCompany();
  const { state, secondsLeft, apply, undo } = useSettingsMutation(proposal);
  const [editing, setEditing] = useState(false);
  const [editedJson, setEditedJson] = useState<string>(() =>
    typeof proposal.proposed_value === 'string'
      ? proposal.proposed_value
      : JSON.stringify(proposal.proposed_value, null, 2)
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const isStructured = useMemo(
    () => typeof proposal.proposed_value === 'object' && proposal.proposed_value !== null,
    [proposal.proposed_value]
  );

  if (cancelled) return null;

  const acceptDisabled = !isAdmin || state.status === 'applying' || state.status === 'applied';
  const deepLink = `/settings?tab=${encodeURIComponent(proposal.settings_tab)}`;

  const handleAccept = () => {
    if (editing && isStructured) {
      try {
        const parsed = JSON.parse(editedJson);
        apply({ proposed_value: parsed });
      } catch {
        setEditError('Invalid JSON.');
        return;
      }
    } else if (editing) {
      apply({ proposed_value: editedJson });
    } else {
      apply();
    }
  };

  return (
    <div
      data-testid="settings-mutation-card"
      className="my-2 rounded-lg border border-border/60 bg-card/60 backdrop-blur-sm p-3 text-sm"
    >
      <div className="flex items-center gap-2 mb-2 text-foreground">
        <SettingsIcon className="h-4 w-4 text-primary" />
        <span className="font-medium">AI proposes a settings change</span>
      </div>

      <div className="mb-1">
        <span className="font-medium text-foreground">{proposal.human_name}</span>
        {proposal.description && (
          <span className="text-muted-foreground"> — {proposal.description}</span>
        )}
      </div>

      <div className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[12px]">
        <span className="text-muted-foreground">Current</span>
        <pre data-testid="current-value" className="font-mono text-foreground/80 whitespace-pre-wrap break-all m-0">
          {formatValue(proposal.current_value)}
        </pre>
        <span className="text-muted-foreground">Proposed</span>
        {editing ? (
          <textarea
            data-testid="edit-input"
            className="font-mono text-[12px] rounded border border-border bg-background p-1 min-h-[60px]"
            value={editedJson}
            onChange={(e) => { setEditedJson(e.target.value); setEditError(null); }}
          />
        ) : (
          <pre data-testid="proposed-value" className="font-mono text-primary whitespace-pre-wrap break-all m-0">
            {formatValue(proposal.proposed_value)}
          </pre>
        )}
      </div>
      {editError && (
        <div role="alert" className="mb-2 text-[12px] text-destructive">{editError}</div>
      )}

      <div className="mb-2 text-[11px] text-muted-foreground">
        <code className="font-mono">{proposal.tool_name}</code>
        {proposal.source_prompt && (
          <span> · Generated from: “{proposal.source_prompt}”</span>
        )}
      </div>

      {!isAdmin && (
        <div className="mb-2 text-[12px] text-amber-500">
          Admin only — ask a workspace admin to apply this change.
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mb-2 text-[12px] text-destructive">{state.message}</div>
      )}

      {state.status === 'applied' && (
        <div className="flex items-center justify-between rounded-md bg-success/10 border border-success/30 px-2 py-1.5 text-[12px]">
          <span className="text-success flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Applied
            {secondsLeft > 0 && <span className="text-muted-foreground"> · Undo in {secondsLeft}s</span>}
          </span>
          {secondsLeft > 0 && (
            <button
              type="button"
              data-testid="undo-btn"
              onClick={undo}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          )}
        </div>
      )}

      {state.status === 'undone' && (
        <div className="text-[12px] text-muted-foreground">Change reverted.</div>
      )}

      {state.status !== 'applied' && state.status !== 'undone' && (
        <div className="flex items-center gap-2">
          <Link
            to={deepLink}
            data-testid="cancel-btn"
            onClick={() => setCancelled(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 text-[12px]"
          >
            <X className="h-3.5 w-3.5" /> Cancel
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
          <button
            type="button"
            data-testid="edit-btn"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 text-[12px]"
          >
            <Edit3 className="h-3.5 w-3.5" /> {editing ? 'Done editing' : 'Edit'}
          </button>
          <button
            type="button"
            data-testid="accept-btn"
            disabled={acceptDisabled}
            onClick={handleAccept}
            title={!isAdmin ? 'Admin only' : undefined}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-[12px]"
          >
            {state.status === 'applying' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</>
            ) : (
              <><Check className="h-3.5 w-3.5" /> Accept</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default SettingsMutationCard;