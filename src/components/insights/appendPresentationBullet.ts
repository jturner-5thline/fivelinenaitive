import { supabase } from '@/integrations/supabase/client';
import { getSeedContent } from './AgendaEditor';

const headingText = (n: any) =>
  n?.type === 'heading' ? (n.content ?? []).map((c: any) => c?.text ?? '').join('').trim() : null;

const nodeText = (n: any): string =>
  !n ? '' : n.type === 'text' ? n.text ?? '' : (n.content ?? []).map(nodeText).join('');

export const REPORT_ORDER = ['JM', 'JT', 'SW'] as const;
export const SECTION_ORDER = ['Narrative/Executive Summary', 'KPIs', 'Goals & Priorities', 'Open Risks'] as const;
export type AgendaSection = typeof SECTION_ORDER[number];

/** Map a report comment source to its canonical Agenda section. */
export function classifySection(sourceType: string, sourceId: string): AgendaSection {
  const t = (sourceType || '').toLowerCase();
  const id = (sourceId || '').toLowerCase();
  if (t === 'kpi' || t === 'chart' || id.includes('kpi')) return 'KPIs';
  if (t === 'risk' || id === 'goals' || id.includes('risk')) return 'Open Risks';
  if (t === 'goal' || t === 'goal-priority' || t === 'initiative' || id === 'metrics' || id.includes('initiative') || id.includes('priorit')) return 'Goals & Priorities';
  return 'Narrative/Executive Summary';
}

const parentLabel = (persona: string, section: string) => `${persona} - ${section}`;

function parseParent(text: string): { r: number; s: number } | null {
  const m = /^(JM|JT|SW) - (.+)$/.exec(text.trim());
  if (!m) return null;
  const s = SECTION_ORDER.indexOf(m[2] as AgendaSection);
  if (s === -1) return null;
  return { r: REPORT_ORDER.indexOf(m[1] as any), s };
}

/**
 * Adds a report comment under the Agenda "Presentation" section as a
 * sub-bullet of a "{Report} - {Section}" parent bullet. Parent bullets are
 * kept sorted by report (JM, JT, SW) then section order.
 */
export async function appendPresentationBullet(opts: {
  companyId: string;
  userId: string;
  periodType: string;
  periodKey: string;
  persona: string;
  section: AgendaSection;
  comment: string;
  snippet?: string | null;
  author?: string | null;
}) {
  const { companyId, userId, periodType, periodKey, persona, section, comment, snippet, author } = opts;
  const { data } = await supabase
    .from('insights_agenda')
    .select('content_json')
    .eq('company_id', companyId)
    .eq('period_type', periodType)
    .eq('period_key', periodKey)
    .maybeSingle();
  const existing = data?.content_json as any;
  const doc = existing && existing.type === 'doc' && Array.isArray(existing.content)
    ? structuredClone(existing)
    : structuredClone(getSeedContent(periodType, periodKey));

  const childContent: any[] = [{ type: 'text', text: comment }];
  const snip = (snippet || '').replace(/\s+/g, ' ').trim();
  if (snip) {
    childContent.push({ type: 'text', marks: [{ type: 'italic' }], text: ` — on: “${snip.length > 220 ? snip.slice(0, 220) + '…' : snip}”` });
  }
  if (author) childContent.push({ type: 'text', marks: [{ type: 'bold' }], text: ` (${author})` });
  const child = { type: 'listItem', content: [{ type: 'paragraph', content: childContent }] };

  const nodes: any[] = doc.content;
  let hIdx = nodes.findIndex((n) => headingText(n) === 'Presentation');
  if (hIdx === -1) {
    nodes.unshift({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Presentation' }] });
    hIdx = 0;
  }
  let end = nodes.length;
  for (let i = hIdx + 1; i < nodes.length; i++) if (nodes[i]?.type === 'heading') { end = i; break; }
  let listIdx = -1;
  for (let i = hIdx + 1; i < end; i++) if (nodes[i]?.type === 'bulletList') { listIdx = i; break; }
  if (listIdx === -1) {
    let at = hIdx + 1;
    if (nodes[at]?.type === 'paragraph' && nodes[at]?.content?.length) at++;
    const emptyPara = at < end && nodes[at]?.type === 'paragraph' && !(nodes[at]?.content?.length);
    nodes.splice(at, emptyPara ? 1 : 0, { type: 'bulletList', content: [] });
    listIdx = at;
  }
  const list = nodes[listIdx];
  const items: any[] = list.content ?? [];
  const label = parentLabel(persona, section);
  let parent = items.find((li) => nodeText(li?.content?.[0]).trim() === label);
  if (!parent) {
    parent = { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: label }] }] };
    items.push(parent);
  }
  let sub = parent.content.find((c: any) => c?.type === 'bulletList');
  if (!sub) { sub = { type: 'bulletList', content: [] }; parent.content.push(sub); }
  sub.content.push(child);

  // Sort: managed parents by (report, section); other items keep order after them.
  const managed = items.filter((li) => parseParent(nodeText(li?.content?.[0])));
  const other = items.filter((li) => !parseParent(nodeText(li?.content?.[0])));
  managed.sort((a, b) => {
    const pa = parseParent(nodeText(a.content[0]))!, pb = parseParent(nodeText(b.content[0]))!;
    return pa.r - pb.r || pa.s - pb.s;
  });
  list.content = [...managed, ...other];

  const { error } = await supabase
    .from('insights_agenda')
    .upsert({ user_id: userId, company_id: companyId, period_type: periodType, period_key: periodKey, content_json: doc } as any,
      { onConflict: 'company_id,period_type,period_key' });
  if (error) throw error;
}

/**
 * Removes a comment's sub-bullet from the Agenda Presentation section.
 * Drops the "{Report} - {Section}" parent if it no longer has comments.
 */
export async function removePresentationBullet(opts: {
  companyId: string;
  periodType: string;
  periodKey: string;
  comment: string;
  author?: string | null;
}) {
  const { companyId, periodType, periodKey, author } = opts;
  const comment = (opts.comment || '').trim();
  if (!comment) return;
  const { data } = await supabase
    .from('insights_agenda')
    .select('content_json')
    .eq('company_id', companyId)
    .eq('period_type', periodType)
    .eq('period_key', periodKey)
    .maybeSingle();
  const existing = data?.content_json as any;
  if (!existing || existing.type !== 'doc' || !Array.isArray(existing.content)) return;
  const doc = structuredClone(existing);
  const nodes: any[] = doc.content;
  const hIdx = nodes.findIndex((n) => headingText(n) === 'Presentation');
  if (hIdx === -1) return;
  let changed = false;
  const matches = (li: any) => {
    const para = li?.content?.[0];
    const first = (para?.content?.[0]?.text ?? '').trim();
    if (first !== comment) return false;
    if (!author) return true;
    return nodeText(para).includes(`(${author})`);
  };
  for (let i = hIdx + 1; i < nodes.length && nodes[i]?.type !== 'heading'; i++) {
    const list = nodes[i];
    if (list?.type !== 'bulletList') continue;
    list.content = (list.content ?? []).filter((parent: any) => {
      if (!parseParent(nodeText(parent?.content?.[0]))) return true;
      const sub = parent.content?.find((c: any) => c?.type === 'bulletList');
      if (!sub || changed) return true;
      const idx = (sub.content ?? []).findIndex(matches);
      if (idx === -1) return true;
      sub.content.splice(idx, 1);
      changed = true;
      return sub.content.length > 0;
    });
  }
  if (!changed) return;
  const { error } = await supabase
    .from('insights_agenda')
    .update({ content_json: doc } as any)
    .eq('company_id', companyId)
    .eq('period_type', periodType)
    .eq('period_key', periodKey);
  if (error) throw error;
}
