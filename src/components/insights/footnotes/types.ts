export type FootnoteType = 'decision' | 'note' | 'action_item';

export interface AgendaFootnote {
  id: string;
  company_id: string;
  agenda_period_type: 'month' | 'quarter';
  agenda_period_key: string;
  footnote_type: FootnoteType;
  source_type: string;
  source_id: string | null;
  source_anchor: string | null;
  source_snapshot_text: string;
  source_current_text: string | null;
  source_updated_at: string | null;
  link_url: string | null;
  status: 'active' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InsertFootnoteInput {
  footnoteType: FootnoteType;
  sourceType: string;
  sourceId?: string | null;
  sourceAnchor?: string | null;
  snapshotText: string;
  linkUrl?: string | null;
  /** When true, force a new canonical footnote even if dedup would match. */
  duplicate?: boolean;
}

export type InsertMode = 'marker' | 'freetext' | 'footnote_only';

export interface InsertAgendaFootnoteEvent {
  footnoteId: string;
  refId: string;
  mode: 'marker' | 'freetext';
  label: string;
  snapshotText: string;
}

export const AGENDA_INSERT_EVENT = 'agenda:insert-footnote-ref';