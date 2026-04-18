export interface CellComment {
  id: string;
  company_id: string;
  plan_id: string | null;
  line_item_key: string;
  line_item_label: string;
  week_key: string; // YYYY-MM-DD (Saturday week-start used as key)
  week_num: number | null;
  week_ending: string | null;
  cell_value_snapshot: number | null;
  content_html: string;
  content_json: any | null;
  content_text: string;
  created_by: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  // hydrated client-side
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  author_email?: string | null;
}

export interface NewCellCommentInput {
  line_item_key: string;
  line_item_label: string;
  week_key: string;
  week_num: number | null;
  week_ending: string | null;
  cell_value_snapshot: number | null;
  content_html: string;
  content_text: string;
  content_json?: any;
  parent_comment_id?: string | null;
  plan_id?: string | null;
}
