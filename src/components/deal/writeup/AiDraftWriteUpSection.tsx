import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Pencil, Sparkles, ShieldAlert, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface DraftSection {
  key: string;
  title: string;
  /** Markdown / plain text content. Editable inline. */
  content: string;
  /** Optional hint shown below the heading. */
  hint?: string;
}

interface Props {
  sections: DraftSection[];
  onChange: (key: string, content: string) => void;
  onApprove: (html: string) => void | Promise<void>;
  onExportBranded: () => void;
  isApproved: boolean;
  isApproving?: boolean;
  approvedVersion?: number | null;
  generatedAt?: Date | null;
}

/**
 * AI Draft Write-Up — inline (not a modal) editable narrative draft that
 * renders below the Edit Deal form once "Generate Complete Write-Up" has
 * run. Designed for human-in-the-loop review: nothing is exported or
 * archived until the advisor clicks Approve & Export.
 */
export function AiDraftWriteUpSection({
  sections,
  onChange,
  onApprove,
  onExportBranded,
  isApproved,
  isApproving = false,
  approvedVersion,
  generatedAt,
}: Props) {
  const [editing, setEditing] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const fullHtml = useMemo(() => buildHtml(sections), [sections]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[rgba(126,184,247,0.25)] bg-[linear-gradient(180deg,rgba(126,184,247,0.06),rgba(126,184,247,0.02))] p-5 space-y-5"
    >
      {/* Human Review Banner */}
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border p-3',
          isApproved
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/5',
        )}
      >
        {isApproved ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-semibold',
                isApproved ? 'text-emerald-500' : 'text-amber-500',
              )}
            >
              {isApproved ? 'Approved Write-Up' : 'Human Review Required'}
            </span>
            {approvedVersion ? (
              <Badge variant="secondary" className="text-[10px]">
                v{approvedVersion} archived to Data Room
              </Badge>
            ) : null}
            {generatedAt ? (
              <span className="text-[11px] text-muted-foreground">
                Generated {generatedAt.toLocaleString()}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isApproved
              ? 'This write-up has been approved and archived. You can export a branded document or continue editing to create a new version.'
              : 'Review the AI-drafted sections below. Edit any section inline before approving and exporting.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? 'Preview' : 'Edit Draft'}
          </Button>
          {isApproved ? (
            <Button size="sm" onClick={onExportBranded} className="gap-1.5">
              <FileDown className="h-3.5 w-3.5" />
              Export Branded
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onApprove(fullHtml)}
              disabled={isApproving}
              className="gap-1.5"
            >
              {isApproving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve &amp; Export
            </Button>
          )}
        </div>
      </div>

      {/* Heading */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">AI Draft Write-Up</h3>
        <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          Powered by Lovable AI
        </span>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((s) => (
          <div
            key={s.key}
            className="rounded-lg border bg-background/40 p-4 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">{s.title}</h4>
              {s.hint ? (
                <span className="text-[10px] text-muted-foreground">{s.hint}</span>
              ) : null}
            </div>
            {editing ? (
              <textarea
                value={s.content}
                onChange={(e) => onChange(s.key, e.target.value)}
                rows={Math.max(4, Math.min(20, s.content.split('\n').length + 1))}
                className="w-full resize-y rounded-md border border-input bg-background/60 px-3 py-2 text-sm leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={`Draft the ${s.title.toLowerCase()} here…`}
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                {s.content || (
                  <span className="text-muted-foreground italic">
                    (No content yet — switch to Edit Draft to add this section.)
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildHtml(sections: DraftSection[]): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return sections
    .map(
      (s) =>
        `<section style="margin:0 0 24px 0;"><h2 style="font-size:16px;margin:0 0 8px 0;">${escape(
          s.title,
        )}</h2><div style="white-space:pre-wrap;font-size:13px;line-height:1.55;">${escape(
          s.content || '',
        )}</div></section>`,
    )
    .join('\n');
}