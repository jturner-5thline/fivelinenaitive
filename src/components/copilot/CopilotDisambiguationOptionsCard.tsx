import { useState } from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface CopilotDisambiguationOption {
  id: string;
  kind: 'deal' | 'contact' | 'company' | 'lender' | 'funding_source';
  label: string;
}

export interface CopilotDisambiguationMessage {
  intro: string[];
  outro: string[];
  options: CopilotDisambiguationOption[];
}

interface CandidateMatch {
  deal_id: string;
  name: string;
}

const CHOOSE_CUE_RE = /(which\s+one\s+would\s+you\s+like\s+to\s+(?:see|open)|which\s+.+\s+did\s+you\s+mean|choose\s+(?:an?|the)?\s*option|choose\s+one|pick\s+one|pick\s+from|select\s+one|multiple\s+(?:deals?|matches|options)|similar\s+deals|found\s+\d+\s+deals?)/i;

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseEntityReference(href: string): Pick<CopilotDisambiguationOption, 'id' | 'kind'> | null {
  const customMatch = /^(deal|contact|company|lender|funding_source|naitive):\/\/(?:([a-z_]+)\/)?([^/?#\s]+)/i.exec(href);
  if (customMatch) {
    const scheme = customMatch[1].toLowerCase();
    const subtype = customMatch[2]?.toLowerCase();
    const id = customMatch[3];
    const kind = (scheme === 'naitive' ? (subtype || 'deal').replace(/s$/, '') : scheme) as CopilotDisambiguationOption['kind'];
    return { id, kind };
  }

  const entityMatch = /^entity:\/\/([a-z_]+)\/([^/?#\s]+)/i.exec(href);
  if (!entityMatch) return null;

  const kind = entityMatch[1].toLowerCase() as CopilotDisambiguationOption['kind'];
  if (!['deal', 'contact', 'company', 'lender', 'funding_source'].includes(kind)) return null;
  return { kind, id: entityMatch[2] };
}

function resolveCandidateLink(label: string, candidates: CandidateMatch[]): CopilotDisambiguationOption | null {
  const normalizedLabel = normalizeLabel(label);
  const match = candidates.find((candidate) => normalizeLabel(candidate.name) === normalizedLabel)
    || candidates.find((candidate) => normalizedLabel.includes(normalizeLabel(candidate.name)) || normalizeLabel(candidate.name).includes(normalizedLabel));
  if (!match) return null;
  return {
    id: match.deal_id,
    kind: 'deal',
    label: match.name,
  };
}

export function parseCopilotDisambiguationMessage(
  content: string,
  candidates: CandidateMatch[] = [],
): CopilotDisambiguationMessage | null {
  if (!content.trim()) return null;

  const lines = content.split('\n');
  const options: Array<CopilotDisambiguationOption & { lineIndex: number }> = [];
  const seenIds = new Set<string>();

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const linkLineMatch = /\[([^\]]+)\]\(([^)]+)\)/i.exec(trimmed);
    if (!linkLineMatch) return;

    const label = linkLineMatch[1].trim();
    const href = linkLineMatch[2].trim();
    const resolved = parseEntityReference(href) || resolveCandidateLink(label, candidates);
    if (!resolved || seenIds.has(`${resolved.kind}:${resolved.id}`)) return;

    const displayLabel = trimmed
      .replace(/^(?:[-*+]\s+|\d+\.\s+)+/, '')
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    seenIds.add(`${resolved.kind}:${resolved.id}`);
    options.push({ ...resolved, label: displayLabel || label, lineIndex });
  });

  if (options.length < 2) return null;

  const combinedText = lines.join(' ').replace(/\s+/g, ' ').trim();
  const hasCue = CHOOSE_CUE_RE.test(combinedText);
  const allDealOptions = options.every((option) => option.kind === 'deal');
  const listDensity = options.length >= Math.max(2, lines.filter((line) => line.trim()).length - 2);
  if (!hasCue && !(allDealOptions && listDensity)) return null;

  const firstOptionLine = options[0].lineIndex;
  const lastOptionLine = options[options.length - 1].lineIndex;

  return {
    intro: lines.slice(0, firstOptionLine).map((line) => line.trim()).filter(Boolean),
    outro: lines.slice(lastOptionLine + 1).map((line) => line.trim()).filter(Boolean),
    options: options.map(({ id, kind, label }) => ({ id, kind, label })),
  };
}

function buildDisambiguationPrompt(option: CopilotDisambiguationOption) {
  const safeLabel = option.label.replace(/"/g, '\\"');
  return `Use the ${option.kind} "${safeLabel}" (id: ${option.id}). Resolve the disambiguation with this choice and continue.`;
}

export function CopilotDisambiguationOptionsCard({
  message,
}: {
  message: CopilotDisambiguationMessage;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const handleSelect = (option: CopilotDisambiguationOption) => {
    const optionKey = `${option.kind}:${option.id}`;
    if (selectedKey) return;
    setSelectedKey(optionKey);
    window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt: buildDisambiguationPrompt(option) } }));
    window.dispatchEvent(new CustomEvent('copilot-disambiguation-resolved', {
      detail: {
        id: option.id,
        kind: option.kind,
        ...(option.kind === 'deal' ? { deal_id: option.id } : {}),
      },
    }));
  };

  return (
    <Card className="my-2 border-border/70 bg-card/80" data-testid="copilot-disambiguation-card">
      <CardContent className="space-y-3 p-4">
        {message.intro.length > 0 && (
          <div className="space-y-1">
            {message.intro.map((line, index) => (
              <p key={`${line}-${index}`} className={cn(index === 0 ? 'text-sm font-semibold' : 'text-xs text-muted-foreground')}>
                {line}
              </p>
            ))}
          </div>
        )}

        <div className="grid gap-2">
          {message.options.map((option) => {
            const optionKey = `${option.kind}:${option.id}`;
            const isSelected = selectedKey === optionKey;
            const isDimmed = !!selectedKey && !isSelected;

            return (
              <div
                key={optionKey}
                role="button"
                tabIndex={selectedKey ? -1 : 0}
                onClick={() => handleSelect(option)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelect(option);
                  }
                }}
                aria-pressed={isSelected}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors outline-none',
                  isSelected
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border/60 bg-background/40 hover:bg-background/70',
                  isDimmed && 'opacity-50',
                  !selectedKey && 'cursor-pointer focus-visible:ring-1 focus-visible:ring-ring',
                  selectedKey && !isSelected && 'cursor-not-allowed',
                )}
                data-testid={`copilot-disambiguation-option-${option.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{option.label}</div>
                </div>

                <button
                  type="button"
                  aria-label={isSelected ? 'Selected' : `Select ${option.label}`}
                  aria-pressed={isSelected}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelect(option);
                  }}
                  disabled={!!selectedKey && !isSelected}
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-background/40 text-muted-foreground hover:bg-background/70',
                    isDimmed && 'cursor-not-allowed',
                  )}
                  data-testid={`copilot-disambiguation-check-${option.id}`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {message.outro.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {message.outro.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}