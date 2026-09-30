import { supabase } from '@/integrations/supabase/client';
import { getSeedContent } from './AgendaEditor';

const headingText = (n: any) =>
  n?.type === 'heading' ? (n.content ?? []).map((c: any) => c?.text ?? '').join('').trim() : null;

/**
 * Appends a bullet under the "Presentation" section of the Agenda for the
 * given period. Used when a comment is made on a JT/JM/SW report.
 */
export async function appendPresentationBullet(opts: {
  companyId: string;
  userId: string;
  periodType: string;
  periodKey: string;
  text: string;
}) {
  const { companyId, userId, periodType, periodKey, text } = opts;
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

  const item = { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  const nodes: any[] = doc.content;
  let hIdx = nodes.findIndex((n) => headingText(n) === 'Presentation');
  if (hIdx === -1) {
    nodes.unshift({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Presentation' }] });
    hIdx = 0;
  }
  let end = nodes.length;
  for (let i = hIdx + 1; i < nodes.length; i++) if (nodes[i]?.type === 'heading') { end = i; break; }
  let listIdx = -1;
  for (let i = end - 1; i > hIdx; i--) if (nodes[i]?.type === 'bulletList') { listIdx = i; break; }
  if (listIdx !== -1) {
    nodes[listIdx].content = [...(nodes[listIdx].content ?? []), item];
  } else {
    // Insert after the subtitle paragraph (if present), replacing a trailing empty paragraph.
    let at = hIdx + 1;
    if (nodes[at]?.type === 'paragraph' && nodes[at]?.content?.length) at++;
    const emptyPara = nodes[at]?.type === 'paragraph' && !(nodes[at]?.content?.length) && at < end;
    nodes.splice(at, emptyPara ? 1 : 0, { type: 'bulletList', content: [item] });
  }

  const { error } = await supabase
    .from('insights_agenda')
    .upsert({ user_id: userId, company_id: companyId, period_type: periodType, period_key: periodKey, content_json: doc } as any,
      { onConflict: 'company_id,period_type,period_key' });
  if (error) throw error;
}
