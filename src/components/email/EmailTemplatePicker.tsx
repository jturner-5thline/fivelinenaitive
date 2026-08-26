import { useMemo, useState } from 'react';
import { Loader2, Mail, FileText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOutboundEmailTemplates, OutboundEmailTemplate } from '@/hooks/useOutboundEmailTemplates';
import { cn } from '@/lib/utils';

export interface PickedTemplate {
  id: string | null;
  title: string;
  subject: string;
  bodyHtml: string;
}

interface Props {
  /** Tokens replaced in subject/body, e.g. { meeting_title: 'Kickoff' } */
  tokens?: Record<string, string>;
  onPick: (picked: PickedTemplate) => void;
  onSkip: () => void;
  skipLabel?: string;
}

function applyTokens(text: string, tokens: Record<string, string>): string {
  let out = text || '';
  for (const [key, value] of Object.entries(tokens)) {
    out = out.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), value ?? '');
  }
  return out;
}

/** Searchable list of pre-configured outbound email templates. */
export function EmailTemplatePicker({ tokens = {}, onPick, onSkip, skipLabel = 'Start from blank' }: Props) {
  const { data: templates = [], isLoading } = useOutboundEmailTemplates();
  const [query, setQuery] = useState('');

  const active = useMemo(
    () => templates.filter((t) => t.is_active !== false),
    [templates],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter((t) =>
      [t.title, t.subject_line, t.sequence_name, t.category]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [active, query]);

  const handlePick = (t: OutboundEmailTemplate) => {
    onPick({
      id: t.id,
      title: t.title,
      subject: applyTokens(t.subject_line || '', tokens),
      bodyHtml: applyTokens(t.body_rich_text || t.body_plain_text || '', tokens),
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates..."
          className="w-full h-9 pl-8 pr-3 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/50"
        />
      </div>

      <div className="max-h-[340px] overflow-y-auto rounded-md border border-white/5">
        {isLoading ? (
          <div className="px-3 py-8 text-center text-xs text-white/60">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" /> Loading templates…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-white/60">
            No templates configured yet. Add them in Settings ▸ Email Templates.
          </div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handlePick(t)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-start gap-2 transition-colors',
                'hover:bg-white/[0.04] border-b border-white/[0.03] last:border-0',
              )}
            >
              <FileText className="h-3.5 w-3.5 text-white/50 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{t.title}</div>
                <div className="text-[11px] text-white/50 truncate">{t.subject_line}</div>
              </div>
              {t.sequence_name && (
                <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 shrink-0 border-white/15 text-white/60">
                  {t.sequence_name}
                </Badge>
              )}
            </button>
          ))
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onSkip}>
          <Mail className="h-3.5 w-3.5 mr-1" /> {skipLabel}
        </Button>
      </div>
    </div>
  );
}
