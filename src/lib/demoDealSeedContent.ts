/**
 * Demo-only seeded notes & documents for the deal workspace.
 *
 * When the demo workspace (demo@5thline.co) opens a deal that has no
 * real notes / documents, we render a believable but clearly synthetic
 * set of placeholder items so the Notes and Documents sections never
 * look empty during demos. Nothing is written to the database — these
 * items live only in the in-memory hook state, and downstream actions
 * (download, preview, extraction) are short-circuited.
 *
 * Production tenants are unaffected.
 */
import type { DealSpaceNote } from '@/hooks/useDealSpaceNotes';
import type { DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';

/** Stable prefix used to flag synthetic ids so mutating ops can no-op. */
export const DEMO_SEED_NOTE_PREFIX = 'demo-seed-note-';
export const DEMO_SEED_DOC_PREFIX = 'demo-seed-doc-';

export function isDemoSeedNoteId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DEMO_SEED_NOTE_PREFIX);
}

export function isDemoSeedDocId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DEMO_SEED_DOC_PREFIX);
}

/** FNV-1a 32-bit hash for deterministic seeded values. */
function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic timestamp `daysAgo` days before now, jittered by seed. */
function seededDate(seed: number, daysAgo: number, hourSeed = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hourSeed + (seed % 6), (seed * 7) % 60, 0, 0);
  return d.toISOString();
}

interface NoteSeed {
  title: string;
  category: string; // surfaced as a tag
  preview: string;
  body: string;
  daysAgo: number;
  pinned?: boolean;
}

const NOTE_SEEDS: NoteSeed[] = [
  {
    title: 'Initial Discovery Call — Notes',
    category: 'Discovery',
    preview:
      'Walked through use of funds, current capital stack, and target close timing. Founder open to a 36-month term with light covenants.',
    body:
      '<p><strong>Attendees:</strong> Founder, CFO, 5th Line deal team</p>' +
      '<p><strong>Use of funds:</strong> working capital + inventory build for Q3 expansion.</p>' +
      '<p><strong>Capital stack:</strong> $2.4M existing senior, no mezz, ~6 months runway.</p>' +
      '<p><strong>Targets:</strong> $8–12M facility, 36-month term, prefer minimal financial covenants.</p>' +
      '<p><strong>Next steps:</strong> request trailing 12 financials, AR aging, and a 13-week cash flow.</p>',
    daysAgo: 12,
    pinned: true,
  },
  {
    title: 'Lender Outreach Plan',
    category: 'Strategy',
    preview:
      'Tier 1 priority list ready: 4 ABL groups, 2 specialty finance, 1 alternative credit. Initial blast scheduled.',
    body:
      '<p><strong>Tier 1:</strong> 4 ABL shops with strong fit on inventory advance rates.</p>' +
      '<p><strong>Tier 2:</strong> 2 specialty finance groups for stretch on receivables.</p>' +
      '<p><strong>Tier 3:</strong> 1 alternative credit fund as fallback for unitranche.</p>' +
      '<p>Outreach goes out Monday — teaser + one-page summary attached in Documents.</p>',
    daysAgo: 9,
  },
  {
    title: 'Management Presentation Prep',
    category: 'Materials',
    preview:
      'Slide flow agreed — market, traction, financial trajectory, capital ask, Q&A. CFO will own the financial slides.',
    body:
      '<p>Slide order: market → traction → financials → capital ask → Q&amp;A.</p>' +
      '<p>CFO owns financials slide; founder runs intro and Q&amp;A.</p>' +
      '<p>Dry run scheduled with deal team before lender meetings.</p>',
    daysAgo: 6,
  },
  {
    title: 'Term Sheet Comparison Notes',
    category: 'Diligence',
    preview:
      'Comparing two indicative term sheets. Pricing within 75 bps; covenants and prepayment flexibility are the main delta.',
    body:
      '<p><strong>Lender A:</strong> SOFR + 5.50%, springing FCCR, 1% prepay year 1.</p>' +
      '<p><strong>Lender B:</strong> SOFR + 6.25%, no springing covenant, no prepay penalty.</p>' +
      '<p>Recommend pushing Lender A on prepay flexibility before final ranking.</p>',
    daysAgo: 3,
  },
  {
    title: 'Internal Risk Memo — Draft',
    category: 'Internal',
    preview:
      'Customer concentration is the main risk to flag. Top 3 customers = 41% of TTM revenue, but contracts are multi-year.',
    body:
      '<p><strong>Risk:</strong> Top 3 customer concentration at 41% TTM revenue.</p>' +
      '<p><strong>Mitigant:</strong> All three on 24+ month contracts; 2 have auto-renew.</p>' +
      '<p><strong>Ask:</strong> Get written renewal intent from largest customer before closing.</p>',
    daysAgo: 1,
  },
];

interface DocSeed {
  name: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  daysAgo: number;
}

const DOC_SEEDS: DocSeed[] = [
  {
    name: 'Confidential Information Memorandum.pdf',
    category: 'Materials',
    contentType: 'application/pdf',
    sizeBytes: 4_812_544,
    daysAgo: 11,
  },
  {
    name: 'TTM Financials & Projections.xlsx',
    category: 'Financials',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 612_003,
    daysAgo: 10,
  },
  {
    name: 'Lender Teaser — One Pager.pdf',
    category: 'Materials',
    contentType: 'application/pdf',
    sizeBytes: 287_120,
    daysAgo: 9,
  },
  {
    name: 'Cap Table — Current.xlsx',
    category: 'Financials',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 142_336,
    daysAgo: 8,
  },
  {
    name: 'AR Aging Report.xlsx',
    category: 'Financials',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 98_204,
    daysAgo: 6,
  },
  {
    name: 'Customer Contracts Summary.docx',
    category: 'Agreements',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 318_447,
    daysAgo: 5,
  },
  {
    name: 'Indicative Term Sheet — Lender A.pdf',
    category: 'Agreements',
    contentType: 'application/pdf',
    sizeBytes: 421_889,
    daysAgo: 3,
  },
  {
    name: 'Indicative Term Sheet — Lender B.pdf',
    category: 'Agreements',
    contentType: 'application/pdf',
    sizeBytes: 446_210,
    daysAgo: 2,
  },
  {
    name: 'Management Presentation — Draft v3.pptx',
    category: 'Materials',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    sizeBytes: 5_902_771,
    daysAgo: 1,
  },
];

/**
 * Generate the seeded notes for a deal. Deterministic per dealId so the
 * same deal always shows the same fake notes across reloads.
 */
export function buildDemoSeedNotes(dealId: string): DealSpaceNote[] {
  const base = fnv1a(dealId || 'demo-deal');
  return NOTE_SEEDS.map((seed, idx) => ({
    id: `${DEMO_SEED_NOTE_PREFIX}${dealId}-${idx}`,
    deal_id: dealId,
    title: seed.title,
    content: seed.body,
    user_id: 'demo-seed',
    created_at: seededDate(base + idx, seed.daysAgo, 9),
    updated_at: seededDate(base + idx + 1, seed.daysAgo, 14),
    is_pinned: !!seed.pinned,
    folder: null,
    tags: [seed.category, 'Demo'],
    position: idx,
    linked_lender_id: null,
    is_shared: false,
    template_name: null,
  }));
}

/**
 * Generate the seeded Deal Space documents for a deal. Deterministic
 * per dealId. Uses the `deal_space` source so the existing UI category
 * label still renders, with a synthetic category derived from the seed.
 */
export function buildDemoSeedDocuments(dealId: string): DealSpaceDocument[] {
  const base = fnv1a(dealId || 'demo-deal');
  return DOC_SEEDS.map((seed, idx) => ({
    id: `${DEMO_SEED_DOC_PREFIX}${dealId}-${idx}`,
    deal_id: dealId,
    name: seed.name,
    file_path: '',
    content_type: seed.contentType,
    size_bytes: seed.sizeBytes,
    created_at: seededDate(base + idx, seed.daysAgo, 10),
    user_id: null,
    source: 'deal_space' as const,
    storage_bucket: 'deal-space',
    category: seed.category,
  }));
}
