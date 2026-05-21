import React from 'react';
import { FileText, Mic, StickyNote, Mail, Database, Landmark } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Token grammar:  [src:<type>_<id>(#<anchor>)?]
//   doc_<uuid>#p<page>            → document, page anchor
//   tx_<uuid>#t<seconds>          → transcript, second offset (renders as mm:ss)
//   note_<uuid>(#l<line>)?        → note
//   email_<uuid>                  → email
//   field_<table>.<column>#row_<id> → structured field
//   lender_<id>                    → funding source / lender row
export const CITATION_RE = /\[src:([a-z_]+)_([A-Za-z0-9.\-_]+)(?:#([^\]\s]+))?\]/g;

export type CitationKind = 'doc' | 'tx' | 'note' | 'email' | 'field' | 'lender' | 'unknown';

export interface ParsedCitation {
  raw: string;
  kind: CitationKind;
  id: string;          // raw id portion (uuid, table.column, lender id, etc.)
  anchor?: string;     // page/seconds/line/row id
}

const KIND_MAP: Record<string, CitationKind> = {
  doc: 'doc',
  tx: 'tx',
  note: 'note',
  email: 'email',
  field: 'field',
  lender: 'lender',
};

export function parseCitations(text: string): ParsedCitation[] {
  const out: ParsedCitation[] = [];
  const re = new RegExp(CITATION_RE.source, CITATION_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const kind = KIND_MAP[m[1]] ?? 'unknown';
    out.push({ raw: m[0], kind, id: m[2], anchor: m[3] });
  }
  return out;
}

/** Unique source_ids across all citations. */
export function uniqueCitedIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const c of parseCitations(text)) {
    if (c.kind !== 'unknown') ids.add(`${c.kind}_${c.id}`);
  }
  return ids;
}

function formatAnchor(c: ParsedCitation): string {
  if (!c.anchor) return '';
  if (c.kind === 'doc' && c.anchor.startsWith('p')) return `p.${c.anchor.slice(1)}`;
  if (c.kind === 'tx' && c.anchor.startsWith('t')) {
    const secs = parseInt(c.anchor.slice(1), 10);
    if (!isNaN(secs)) {
      const mm = Math.floor(secs / 60);
      const ss = String(secs % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    }
  }
  return c.anchor;
}

const ICONS: Record<CitationKind, React.ComponentType<{ className?: string }>> = {
  doc: FileText,
  tx: Mic,
  note: StickyNote,
  email: Mail,
  field: Database,
  lender: Landmark,
  unknown: FileText,
};

const LABEL: Record<CitationKind, string> = {
  doc: 'Document',
  tx: 'Transcript',
  note: 'Note',
  email: 'Email',
  field: 'Field',
  lender: 'Lender',
  unknown: 'Source',
};

export interface CitationChipProps {
  citation: ParsedCitation;
  onClick?: (c: ParsedCitation) => void;
  index: number;
}

export function CitationChip({ citation, onClick, index }: CitationChipProps) {
  const Icon = ICONS[citation.kind];
  const anchor = formatAnchor(citation);
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onClick?.(citation)}
          className={cn(
            'inline-flex items-center gap-0.5 align-baseline mx-0.5',
            'rounded border border-primary/30 bg-primary/10 px-1 h-4',
            'text-[9px] font-medium text-primary hover:bg-primary/20 hover:border-primary/50',
            'transition-colors leading-none',
          )}
        >
          <Icon className="h-2.5 w-2.5" />
          <span>{index}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-relaxed">
        <div className="font-medium text-foreground/90 mb-0.5">{LABEL[citation.kind]}</div>
        <div className="text-muted-foreground break-all">
          {citation.id}
          {anchor ? <span className="text-foreground/80"> · {anchor}</span> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Walks a string, replacing citation tokens with <CitationChip> nodes.
 * Returns an array of strings and React nodes safe to render inline.
 */
export function renderWithCitations(
  text: string,
  onClick?: (c: ParsedCitation) => void,
  startIndex = 1,
): { nodes: React.ReactNode[]; nextIndex: number } {
  const re = new RegExp(CITATION_RE.source, CITATION_RE.flags);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let idx = startIndex;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const kind = KIND_MAP[m[1]] ?? 'unknown';
    nodes.push(
      <CitationChip
        key={`cite-${m.index}`}
        index={idx++}
        citation={{ raw: m[0], kind, id: m[2], anchor: m[3] }}
        onClick={onClick}
      />,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return { nodes, nextIndex: idx };
}