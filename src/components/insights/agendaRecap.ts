import type { Editor } from '@tiptap/react';

/**
 * Lightweight meeting-capture helpers for the Insights Agenda editor.
 *
 * - Inserts inline "smart tag" lines (Action / Decision / Topic) that render
 *   as ordinary editor content styled by CSS via the highlight color marker.
 * - Scans the current TipTap doc for tagged lines and rebuilds the recap
 *   section at the top of the document. Idempotent — re-running replaces the
 *   existing recap instead of duplicating it.
 * - Appends/refreshes a tiny per-section count badge inside each H1/H2
 *   heading text so the badges piggy-back on existing document rendering
 *   (no portals or sticky overlays).
 */

export const TAG_COLORS = {
  action: '#ff8a3d',
  decision: '#ffeb3b',
  topic: '#5ec8d6',
} as const;

const RECAP_HEADING = 'Meeting Recap';
const RECAP_SUB_HEADINGS = new Set(['Decisions', 'Action Items', 'Key Topics Covered']);
const BADGE_RE = /\s+·\s+(?:\d+[ADT]\s*)+$/;

type TaggedKind = 'action' | 'decision' | 'topic';
interface TaggedItem {
  kind: TaggedKind;
  section: string;
  text: string;
  checked?: boolean;
}
interface SectionCounts { a: number; d: number; t: number; }

// ─── Insertion helpers ─────────────────────────────────────────────────

function tagTextNode(label: string, color: string) {
  return {
    type: 'text',
    marks: [
      { type: 'bold' },
      { type: 'highlight', attrs: { color } },
    ],
    text: label,
  };
}

export function insertActionItem(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            {
              type: 'paragraph',
              content: [
                tagTextNode('[Action]', TAG_COLORS.action),
                { type: 'text', text: ' @owner — description — due: date' },
              ],
            },
          ],
        },
      ],
    })
    .run();
}

export function insertDecision(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'paragraph',
      content: [
        tagTextNode('[Decision]', TAG_COLORS.decision),
        { type: 'text', text: ' ' },
      ],
    })
    .run();
}

export function insertTopic(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'paragraph',
      content: [
        tagTextNode('[Topic]', TAG_COLORS.topic),
        { type: 'text', text: ' ' },
      ],
    })
    .run();
}

// ─── Doc walking ───────────────────────────────────────────────────────

function nodeText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(nodeText).join('');
}

function strippedHeadingText(node: any): string {
  return nodeText(node).replace(BADGE_RE, '').trim();
}

const TAG_RE = /^\s*\[(Action|Decision|Topic)\]\s*(.*)$/i;

function matchTag(text: string): { kind: TaggedKind; rest: string } | null {
  const m = TAG_RE.exec(text);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as TaggedKind, rest: m[2].trim() };
}

function emptyCounts(): SectionCounts { return { a: 0, d: 0, t: 0 }; }

function bumpCounts(c: SectionCounts, kind: TaggedKind) {
  if (kind === 'action') c.a++; else if (kind === 'decision') c.d++; else c.t++;
}

function extractTagged(content: any[]): { items: TaggedItem[]; counts: Map<string, SectionCounts> } {
  const items: TaggedItem[] = [];
  const counts = new Map<string, SectionCounts>();
  let currentSection = '';
  let inRecap = false;

  for (const node of content ?? []) {
    if (node?.type === 'heading') {
      const level = node.attrs?.level ?? 1;
      const t = strippedHeadingText(node);
      if (t === RECAP_HEADING) { inRecap = true; currentSection = ''; continue; }
      if (inRecap && RECAP_SUB_HEADINGS.has(t)) { continue; }
      // A non-recap heading exits the recap region.
      inRecap = false;
      if (level <= 2 && t) {
        currentSection = t;
        if (!counts.has(currentSection)) counts.set(currentSection, emptyCounts());
      } else if (!t) {
        currentSection = '';
      }
      continue;
    }
    if (inRecap) continue;

    if (node?.type === 'paragraph') {
      const m = matchTag(nodeText(node));
      if (!m) continue;
      const section = currentSection || '';
      items.push({ kind: m.kind, section, text: m.rest });
      if (section) {
        if (!counts.has(section)) counts.set(section, emptyCounts());
        bumpCounts(counts.get(section)!, m.kind);
      }
      continue;
    }

    if (node?.type === 'taskList') {
      for (const item of node.content ?? []) {
        if (item?.type !== 'taskItem') continue;
        const m = matchTag(nodeText(item));
        if (!m) continue;
        const section = currentSection || '';
        items.push({ kind: m.kind, section, text: m.rest, checked: !!item.attrs?.checked });
        if (section) {
          if (!counts.has(section)) counts.set(section, emptyCounts());
          bumpCounts(counts.get(section)!, m.kind);
        }
      }
    }
  }

  return { items, counts };
}

// ─── Recap construction ────────────────────────────────────────────────

function listItem(text: string) {
  return {
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function buildRecapNodes(items: TaggedItem[]): any[] {
  const decisions = items.filter(i => i.kind === 'decision');
  const actions = items.filter(i => i.kind === 'action');
  const topics = items.filter(i => i.kind === 'topic');

  const out: any[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: RECAP_HEADING }],
    },
  ];

  if (!decisions.length && !actions.length && !topics.length) {
    out.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        marks: [
          { type: 'italic' },
          { type: 'textStyle', attrs: { color: 'rgba(200,225,255,0.6)' } },
        ],
        text: 'No decisions, action items, or topics tagged yet.',
      }],
    });
    return out;
  }

  const sectionSuffix = (s: string) => (s ? ` (${s})` : '');

  if (decisions.length) {
    out.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Decisions' }] });
    out.push({
      type: 'bulletList',
      content: decisions.map(d => listItem(d.text + sectionSuffix(d.section))),
    });
  }
  if (actions.length) {
    out.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Action Items' }] });
    out.push({
      type: 'taskList',
      content: actions.map(a => ({
        type: 'taskItem',
        attrs: { checked: a.checked ?? false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: a.text + sectionSuffix(a.section) }] }],
      })),
    });
  }
  if (topics.length) {
    out.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Key Topics Covered' }] });
    out.push({
      type: 'bulletList',
      content: topics.map(t => listItem(t.text + sectionSuffix(t.section))),
    });
  }
  return out;
}

// ─── Recap region extraction ───────────────────────────────────────────

function removeExistingRecap(content: any[]): any[] {
  if (!content?.length) return content;
  // Find the first "Meeting Recap" heading at the top of the doc (we always
  // insert it as the first node, so it's expected at index 0 — but we scan
  // anyway in case the user dragged it).
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    const n = content[i];
    if (n?.type === 'heading' && strippedHeadingText(n) === RECAP_HEADING) {
      start = i; break;
    }
  }
  if (start < 0) return content;
  // Walk forward until we hit a non-recap heading at level <=2.
  let end = start + 1;
  while (end < content.length) {
    const n = content[end];
    if (n?.type === 'heading') {
      const level = n.attrs?.level ?? 1;
      const t = strippedHeadingText(n);
      if (level <= 2 && t !== RECAP_HEADING && !RECAP_SUB_HEADINGS.has(t)) break;
    }
    end++;
  }
  return [...content.slice(0, start), ...content.slice(end)];
}

// ─── Heading badge sync ────────────────────────────────────────────────

function stripHeadingBadge(headingContent: any[]): any[] {
  if (!headingContent?.length) return headingContent ?? [];
  // Drop a trailing pure-badge text node, otherwise strip the badge suffix
  // from the trailing text node.
  const last = headingContent[headingContent.length - 1];
  if (last?.type === 'text' && /^\s+·\s+(?:\d+[ADT]\s*)+$/.test(last.text ?? '')) {
    return headingContent.slice(0, -1);
  }
  if (last?.type === 'text' && BADGE_RE.test(last.text ?? '')) {
    return [
      ...headingContent.slice(0, -1),
      { ...last, text: (last.text ?? '').replace(BADGE_RE, '') },
    ];
  }
  return headingContent;
}

function applyBadges(content: any[], counts: Map<string, SectionCounts>): any[] {
  return content.map(node => {
    if (node?.type !== 'heading') return node;
    const level = node.attrs?.level ?? 1;
    const text = strippedHeadingText(node);
    if (text === RECAP_HEADING || RECAP_SUB_HEADINGS.has(text)) return node;
    const stripped = stripHeadingBadge(node.content ?? []);
    if (level > 2) return { ...node, content: stripped };
    const c = counts.get(text);
    if (!c || (c.a === 0 && c.d === 0 && c.t === 0)) {
      return { ...node, content: stripped };
    }
    const parts: string[] = [];
    if (c.a) parts.push(`${c.a}A`);
    if (c.d) parts.push(`${c.d}D`);
    if (c.t) parts.push(`${c.t}T`);
    const badgeText = `  ·  ${parts.join(' ')}`;
    return {
      ...node,
      content: [
        ...stripped,
        {
          type: 'text',
          text: badgeText,
          marks: [
            { type: 'textStyle', attrs: { fontSize: '11px', color: 'rgba(180,210,245,0.55)' } },
          ],
        },
      ],
    };
  });
}

// ─── Public: regenerate recap in editor ────────────────────────────────

export function generateAgendaRecap(editor: Editor) {
  const doc = editor.getJSON();
  const baseContent = removeExistingRecap(doc.content ?? []);
  // Extract tagged items from the doc WITHOUT the prior recap so the recap
  // itself doesn't echo into the next run.
  const { items, counts } = extractTagged(baseContent);
  const recap = buildRecapNodes(items);
  const withBadges = applyBadges(baseContent, counts);
  const newDoc = { type: 'doc', content: [...recap, ...withBadges] };
  editor.chain().setContent(newDoc, { emitUpdate: true }).run();
  return { items, sections: counts.size };
}