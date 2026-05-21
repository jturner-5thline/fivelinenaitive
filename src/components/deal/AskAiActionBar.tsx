import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mail,
  MessageSquare,
  ListChecks,
  CheckSquare,
  FileText,
  Send,
  Flag,
  CalendarPlus,
} from 'lucide-react';

export type AskAiActionType =
  | 'draft_email'
  | 'ask_followup'
  | 'create_task'
  | 'add_outstanding_item'
  | 'request_document'
  | 'send_followup'
  | 'update_status'
  | 'schedule_task';

export interface AskAiAction {
  label: string;
  type: AskAiActionType;
  params: Record<string, string>;
}

const ALLOWED: ReadonlySet<AskAiActionType> = new Set([
  'draft_email',
  'ask_followup',
  'create_task',
  'add_outstanding_item',
  'request_document',
  'send_followup',
  'update_status',
  'schedule_task',
]);

// Matches a trailing "Actions:" block (case-insensitive) with bullet list of
// `- [label](action:type?key=value&...)` links until end of message.
const ACTIONS_BLOCK_RE = /\n+\s*(?:#{1,6}\s*)?actions\s*:\s*\n([\s\S]+?)\s*$/i;
const ACTION_LINK_RE =
  /^\s*[-*]\s*\[([^\]]+)\]\(action:([a-z_]+)(?:\?([^)]*))?\)\s*(?:—\s*.*)?$/i;

function parseParams(qs: string | undefined): Record<string, string> {
  if (!qs) return {};
  const out: Record<string, string> = {};
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const [k, ...rest] = pair.split('=');
    if (!k) continue;
    try {
      out[decodeURIComponent(k)] = decodeURIComponent((rest.join('=') || '').replace(/\+/g, ' '));
    } catch {
      out[k] = rest.join('=');
    }
  }
  return out;
}

export function extractAskAiActions(content: string): {
  cleanContent: string;
  actions: AskAiAction[];
} {
  const match = content.match(ACTIONS_BLOCK_RE);
  if (!match) return { cleanContent: content, actions: [] };

  const actions: AskAiAction[] = [];
  for (const line of match[1].split('\n')) {
    const m = line.match(ACTION_LINK_RE);
    if (!m) continue;
    const [, label, typeRaw, qs] = m;
    const type = typeRaw.toLowerCase() as AskAiActionType;
    if (!ALLOWED.has(type)) continue;
    actions.push({ label: label.trim(), type, params: parseParams(qs) });
    if (actions.length >= 3) break;
  }

  if (actions.length === 0) return { cleanContent: content, actions: [] };
  return {
    cleanContent: content.slice(0, match.index).trimEnd(),
    actions,
  };
}

const ICONS: Record<AskAiActionType, React.ComponentType<{ className?: string }>> = {
  draft_email: Mail,
  ask_followup: MessageSquare,
  create_task: CheckSquare,
  add_outstanding_item: ListChecks,
  request_document: FileText,
  send_followup: Send,
  update_status: Flag,
  schedule_task: CalendarPlus,
};

interface Props {
  actions: AskAiAction[];
  onAction: (action: AskAiAction) => void;
  disabled?: boolean;
}

export function AskAiActionBar({ actions, onAction, disabled }: Props) {
  const items = useMemo(() => actions.slice(0, 3), [actions]);
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
      {items.map((a, i) => {
        const Icon = ICONS[a.type];
        return (
          <Button
            key={`${a.type}-${i}`}
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onAction(a)}
            className="h-8 gap-1.5 text-xs"
          >
            <Icon className="h-3.5 w-3.5" />
            {a.label}
          </Button>
        );
      })}
    </div>
  );
}