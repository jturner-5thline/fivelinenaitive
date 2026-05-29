// Claap scored entity-resolution engine.
// Pure logic shared by the post-call and end-of-day edge functions.
//
// Inputs: a recording row (canonical claap_recordings) and tenant data.
// Outputs: ranked candidate matches for meeting / contact / company / deal,
// each with a numeric score 0..1, ordered reasons, and evidence JSON.
//
// Confidence bands:
//   >= 0.90  → auto-link
//   0.65–0.89 → suggest in review queue
//   < 0.65   → hold

// deno-lint-ignore-file no-explicit-any

export type EntityType = 'meeting' | 'contact' | 'company' | 'deal';
export type RunType = 'post_call' | 'end_of_day';

export interface Reason { code: string; label: string; weight: number }
export interface Candidate {
  entity_type: EntityType;
  entity_id: string;
  score: number;
  reasons: Reason[];
  evidence: Record<string, unknown>;
}

export interface RecordingInput {
  id: string;
  org_company_id: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  organizer_email: string | null;
  participants: any[];
  transcript: string | null;
}

const FREE_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com','live.com',
  'icloud.com','me.com','aol.com','proton.me','protonmail.com',
]);

export function emailDomain(email?: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 0) return null;
  const d = email.slice(at + 1).toLowerCase().trim();
  if (!d.includes('.') || FREE_DOMAINS.has(d)) return null;
  return d;
}

export function dice(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bg = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const g = s1.slice(i, i + 2);
    bg.set(g, (bg.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const g = s2.slice(i, i + 2);
    const n = bg.get(g) || 0;
    if (n > 0) { bg.set(g, n - 1); hits++; }
  }
  return (2 * hits) / (s1.length + s2.length - 2);
}

function clamp(n: number) { return Math.max(0, Math.min(1, n)); }
function ts(v?: string | null) { return v ? new Date(v).getTime() : NaN; }

function participantEmails(p: any[]): string[] {
  return (Array.isArray(p) ? p : [])
    .map((x: any) => (x?.email || x?.address || '').toLowerCase())
    .filter(Boolean);
}

function participantNames(p: any[]): string[] {
  return (Array.isArray(p) ? p : [])
    .map((x: any) => normalizeName(x?.name || x?.displayName || ''))
    .filter(Boolean);
}

// Aggressive title normalization: lowercase, strip punctuation/separators,
// strip common joiner words, collapse whitespace.
export function normalizeTitle(s: string | null | undefined): string {
  if (!s) return '';
  let out = String(s).toLowerCase();
  // NFKC normalize
  try { out = out.normalize('NFKC'); } catch { /* ignore */ }
  // common separators / joiners → space
  out = out.replace(/[|<>/\\\-_:,;.!?()\[\]{}"'`~@#$%^*+=]/g, ' ');
  // strip joiner words and common org/meeting words
  out = out.replace(/\b(vs|and|&|x|w\/|with|meeting|call|sync|review|5th|line)\b/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function titleTokens(s: string): string[] {
  return normalizeTitle(s).split(' ').filter(t => t.length >= 2);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

export function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------- Meeting scoring ----------

export function scoreMeetings(rec: RecordingInput, meetings: any[]): Candidate[] {
  const start = ts(rec.started_at), end = ts(rec.ended_at);
  const recDur = end - start;
  const recEmails = new Set(participantEmails(rec.participants));
  const recNames = new Set(participantNames(rec.participants));
  const recOrg = (rec.organizer_email || '').toLowerCase();
  const recTitleNorm = normalizeTitle(rec.title);
  const recTitleToks = titleTokens(rec.title || '');
  const out: Candidate[] = [];

  for (const m of meetings) {
    const ms = ts(m.start_time), me = ts(m.end_time);
    // Allow missing end times; require at least a start on both sides.
    if (!isFinite(ms) || !isFinite(start)) continue;
    const reasons: Reason[] = [];
    let score = 0;
    let temporalAnchor = false;

    // Time-window overlap (binary at >= 50%, +0.20)
    const meEff = isFinite(me) ? me : ms;
    const endEff = isFinite(end) ? end : start;
    const overlap = Math.max(0, Math.min(endEff, meEff) - Math.max(start, ms));
    const minDur = Math.max(1, Math.min(endEff - start, meEff - ms));
    const ratio = minDur > 0 ? overlap / minDur : 0;
    if (ratio >= 0.5) {
      score += 0.20;
      reasons.push({ code: 'time_overlap', label: `Time overlap ${(ratio * 100) | 0}%`, weight: 0.20 });
      temporalAnchor = true;
    } else if (Math.abs(ms - start) < 15 * 60_000) {
      score += 0.15;
      reasons.push({ code: 'time_near', label: 'Starts within 15 minutes', weight: 0.15 });
      temporalAnchor = true;
    }

    // Same calendar date (start within ± 24h)
    if (Math.abs(ms - start) <= 24 * 60 * 60_000) {
      score += 0.15;
      reasons.push({ code: 'same_day', label: 'Same calendar day', weight: 0.15 });
      temporalAnchor = true;
    }

    // Title scoring (exact normalized OR token Jaccard)
    const mTitleNorm = normalizeTitle(m.title);
    const mToks = titleTokens(m.title || '');
    let titleHit = false;
    if (recTitleNorm && mTitleNorm && recTitleNorm === mTitleNorm) {
      score += 0.60;
      reasons.push({ code: 'title_exact', label: 'Exact title match', weight: 0.60 });
      titleHit = true;
    } else {
      const j = jaccard(recTitleToks, mToks);
      if (j >= 0.7) {
        score += 0.40;
        reasons.push({ code: 'title_tokens', label: `Title tokens match (${Math.round(j * 100)}%)`, weight: 0.40 });
        titleHit = true;
      } else if (j >= 0.5) {
        score += 0.25;
        reasons.push({ code: 'title_tokens_partial', label: `Title tokens partial (${Math.round(j * 100)}%)`, weight: 0.25 });
        titleHit = true;
      } else if (rec.title && m.title) {
        const d = dice(rec.title, m.title);
        if (d > 0.4) {
          const w = d * 0.10;
          score += w;
          reasons.push({ code: 'title_similar', label: `Title similarity ${(d * 100) | 0}%`, weight: w });
        }
      }
    }

    if (recOrg && (m.organizer_email || '').toLowerCase() === recOrg) {
      score += 0.15;
      reasons.push({ code: 'organizer_match', label: 'Organizer email matched', weight: 0.15 });
    }

    const att = (m.attendees || [])
      .map((x: any) => {
        if (typeof x === 'string') return x.toLowerCase();
        if (x && typeof x === 'object') return String(x.email || x.address || '').toLowerCase();
        return '';
      })
      .filter((e: string) => !!e);
    if (att.length && recEmails.size) {
      const matched = att.filter((e: string) => recEmails.has(e)).length;
      const ovr = matched / Math.max(att.length, recEmails.size);
      if (ovr >= 0.5) {
        score += 0.20;
        reasons.push({ code: 'attendee_overlap', label: `${matched} of ${att.length} attendees matched (emails)`, weight: 0.20 });
      } else if (matched >= 1) {
        // Shared-attendee floor: at least one shared email participant
        score += 0.15;
        reasons.push({ code: 'attendee_overlap_floor', label: `${matched} shared attendee${matched === 1 ? '' : 's'}`, weight: 0.15 });
      }
    } else if (recNames.size) {
      // Attendee NAME overlap fallback (when emails are missing on the meeting side)
      const attNames = (m.attendees || [])
        .map((x: any) => normalizeName(typeof x === 'string' ? '' : (x?.displayName || x?.name || '')))
        .filter(Boolean);
      if (attNames.length) {
        let nameMatched = 0;
        for (const n of attNames) if (recNames.has(n)) nameMatched++;
        const ovr = nameMatched / Math.max(attNames.length, recNames.size);
        if (ovr >= 0.5) {
          score += 0.15;
          reasons.push({ code: 'attendee_name_overlap', label: `${nameMatched} of ${attNames.length} attendee names matched`, weight: 0.15 });
        }
      }
    }

    // Require either a temporal anchor OR a strong title hit to keep this candidate.
    if (!temporalAnchor && !titleHit) continue;

    out.push({
      entity_type: 'meeting', entity_id: m.id, score: clamp(score),
      reasons,
      evidence: { meeting_start: m.start_time, organizer: m.organizer_email, duration_ms: recDur },
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

// ---------- Contact scoring ----------

export function scoreContacts(rec: RecordingInput, contacts: any[], recentMeetingContactIds: Set<string>): Candidate[] {
  const recEmails = new Set(participantEmails(rec.participants));
  const recDomains = new Set(
    [...recEmails].map(e => emailDomain(e)).filter(Boolean) as string[],
  );
  const out: Candidate[] = [];

  for (const c of contacts) {
    const reasons: Reason[] = [];
    let score = 0;
    const email = (c.email || '').toLowerCase();
    const dom = emailDomain(email);

    if (email && recEmails.has(email)) {
      score = Math.max(score, 0.95);
      reasons.push({ code: 'email_exact', label: 'Exact email match in participants', weight: 0.95 });
    }

    const full = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    if (full) {
      for (const p of rec.participants || []) {
        const pn = (p?.name || '').toString();
        if (!pn) continue;
        const d = dice(full, pn);
        if (d > 0.85) {
          if (score < 0.70) { score = 0.70; reasons.push({ code: 'name_exact', label: `Name match: ${pn}`, weight: 0.70 }); }
        } else if (d > 0.6 && dom && recDomains.has(dom)) {
          if (score < 0.55) { score = 0.55; reasons.push({ code: 'name_fuzzy_domain', label: `Fuzzy name + same domain (${dom})`, weight: 0.55 }); }
        }
      }
    }

    if (score > 0 && recentMeetingContactIds.has(c.id)) {
      score = clamp(score + 0.05);
      reasons.push({ code: 'recent_meeting', label: 'Met with this contact in the last 14 days', weight: 0.05 });
    }

    if (score > 0) {
      out.push({
        entity_type: 'contact', entity_id: c.id, score,
        reasons,
        evidence: { email, name: full, primary_company_id: c.primary_company_id },
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

// ---------- Company scoring ----------

export function scoreCompanies(
  rec: RecordingInput,
  companies: any[],
  contactCandidates: Candidate[],
  contactById: Map<string, any>,
  activeDealCompanyIds: Set<string>,
): Candidate[] {
  const orgDom = emailDomain(rec.organizer_email);
  const transcript = (rec.transcript || '').toLowerCase();
  const title = (rec.title || '').toLowerCase();

  // Aggregate per-company strength from contact matches
  const byCompany = new Map<string, number>();
  for (const cc of contactCandidates) {
    const c = contactById.get(cc.entity_id);
    const cid = c?.primary_company_id || c?.company_id;
    if (cid) byCompany.set(cid, Math.max(byCompany.get(cid) || 0, cc.score));
  }

  const out: Candidate[] = [];
  for (const co of companies) {
    const reasons: Reason[] = [];
    let score = 0;

    const childScore = byCompany.get(co.id);
    if (childScore) {
      const w = Math.min(0.85, childScore);
      score = Math.max(score, w);
      reasons.push({ code: 'contact_evidence', label: 'Matched via attendee contacts', weight: w });
    }

    const domains: string[] = [co.primary_domain, ...(co.domains || [])].filter(Boolean);
    if (orgDom && domains.includes(orgDom)) {
      score = clamp(score + 0.20);
      reasons.push({ code: 'organizer_domain', label: `Organizer domain matches (${orgDom})`, weight: 0.20 });
    }

    const nm = (co.name || '').toLowerCase();
    if (nm.length > 3 && (title.includes(nm) || transcript.includes(nm))) {
      score = clamp(score + 0.10);
      reasons.push({ code: 'mentioned', label: `Mentioned in ${transcript.includes(nm) ? 'transcript' : 'title'}`, weight: 0.10 });
    }

    if (activeDealCompanyIds.has(co.id) && score > 0) {
      score = clamp(score + 0.05);
      reasons.push({ code: 'active_deal', label: 'Has an active deal', weight: 0.05 });
    }

    if (score > 0) {
      out.push({
        entity_type: 'company', entity_id: co.id, score,
        reasons,
        evidence: { name: co.name, primary_domain: co.primary_domain },
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

// ---------- Deal scoring ----------

export function scoreDeals(
  rec: RecordingInput,
  deals: any[],
  topMeeting: Candidate | undefined,
  meetingDealById: Map<string, string>, // meeting_id -> deal_id (from meeting_deal_links)
  companyCandidates: Candidate[],
): Candidate[] {
  const inheritedDealId = topMeeting && topMeeting.score >= 0.65 ? meetingDealById.get(topMeeting.entity_id) : undefined;
  const companyScoreById = new Map(companyCandidates.map(c => [c.entity_id, c.score]));
  const title = (rec.title || '').toLowerCase();
  const transcript = (rec.transcript || '').toLowerCase();
  const now = Date.now();

  const out: Candidate[] = [];
  for (const d of deals) {
    const reasons: Reason[] = [];
    let score = 0;
    let hasMeetingEvidence = false;

    if (inheritedDealId && d.id === inheritedDealId) {
      score = Math.max(score, 0.90);
      reasons.push({ code: 'meeting_inherit', label: 'Inherited from matched meeting', weight: 0.90 });
      hasMeetingEvidence = true;
    }

    const coScore = (d.company_id && companyScoreById.get(d.company_id))
                 || (d.crm_company_id && companyScoreById.get(d.crm_company_id))
                 || 0;
    if (coScore > 0) {
      const updated = ts(d.updated_at);
      const daysOld = isFinite(updated) ? (now - updated) / (1000 * 60 * 60 * 24) : 365;
      const recency = Math.max(0, 1 - daysOld / 90); // linear decay over 90d
      const w = Math.min(0.70, coScore * recency);
      if (w > 0) {
        score = Math.max(score, w);
        reasons.push({ code: 'company_active', label: `Company match · last activity ${Math.round(daysOld)}d ago`, weight: w });
      }
    }

    const tokens = [d.company, d.borrower, ...(d.lenders || [])].filter(Boolean).map((s: string) => s.toLowerCase());
    let mention = 0;
    for (const tok of tokens) {
      if (tok.length > 3 && (title.includes(tok) || transcript.includes(tok))) mention = Math.max(mention, 0.40);
    }
    if (mention > 0) {
      const capped = hasMeetingEvidence ? mention : Math.min(mention, 0.74);
      score = Math.max(score, capped);
      reasons.push({ code: 'keyword_mention', label: 'Deal name or lender mentioned', weight: capped });
    }

    if (!hasMeetingEvidence) {
      const updated = ts(d.updated_at);
      const daysOld = isFinite(updated) ? (now - updated) / (1000 * 60 * 60 * 24) : 365;
      if (daysOld > 60) {
        score = Math.max(0, score - 0.20);
        reasons.push({ code: 'stale_penalty', label: 'Stale deal (no recent activity)', weight: -0.20 });
      }
    }

    if (score > 0) {
      out.push({
        entity_type: 'deal', entity_id: d.id, score: clamp(score),
        reasons,
        evidence: { company: d.company, stage: d.stage, updated_at: d.updated_at },
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

export function bandFor(score: number): 'auto' | 'review' | 'hold' {
  if (score >= 0.90) return 'auto';
  if (score >= 0.65) return 'review';
  return 'hold';
}

export function roleFor(entityType: EntityType): string {
  switch (entityType) {
    case 'meeting': return 'primary_meeting';
    case 'contact': return 'attendee_contact';
    case 'company': return 'primary_company';
    case 'deal': return 'primary_deal';
  }
}