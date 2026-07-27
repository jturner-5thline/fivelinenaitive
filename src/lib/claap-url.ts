export interface ClaapRecordingCandidate {
  id: string;
  source: 'query' | 'share-url' | 'path-token' | 'bare-id';
}

const CLAAP_ID_TOKEN = /^(?=.*[A-Z0-9_])[A-Za-z0-9_]{8,64}$/;
const CLAAP_SHARE_SEGMENT = /(?:^|-)c-([A-Za-z0-9_]{8,64})-([A-Za-z0-9_]{8,64})$/;

function pushCandidate(
  candidates: ClaapRecordingCandidate[],
  seen: Set<string>,
  id: string | null | undefined,
  source: ClaapRecordingCandidate['source'],
) {
  const normalized = (id || '').trim();
  if (!CLAAP_ID_TOKEN.test(normalized) || seen.has(normalized)) return;
  seen.add(normalized);
  candidates.push({ id: normalized, source });
}

function extractFromPathSegment(
  candidates: ClaapRecordingCandidate[],
  seen: Set<string>,
  segment: string,
) {
  const decoded = decodeURIComponent(segment || '').trim();
  if (!decoded) return;

  const shareMatch = decoded.match(CLAAP_SHARE_SEGMENT);
  if (shareMatch) {
    // Claap share URLs end with `...-c-<containerId>-<recordingId>`.
    // The final token is the recording id used by the API/local mirror.
    pushCandidate(candidates, seen, shareMatch[2], 'share-url');
    pushCandidate(candidates, seen, shareMatch[1], 'share-url');
    return;
  }

  pushCandidate(candidates, seen, decoded, 'path-token');

  const tokens = decoded.split('-').reverse();
  for (const token of tokens) {
    pushCandidate(candidates, seen, token, 'path-token');
  }
}

export function extractClaapRecordingCandidates(input: string): ClaapRecordingCandidate[] {
  const raw = input.trim();
  const candidates: ClaapRecordingCandidate[] = [];
  const seen = new Set<string>();
  if (!raw) return candidates;

  try {
    const url = new URL(raw);
    for (const key of ['recordingId', 'recording_id', 'claap_id', 'id']) {
      pushCandidate(candidates, seen, url.searchParams.get(key), 'query');
    }
    const segments = url.pathname.split('/').filter(Boolean).reverse();
    for (const segment of segments) {
      extractFromPathSegment(candidates, seen, segment);
    }
  } catch {
    extractFromPathSegment(candidates, seen, raw);
    pushCandidate(candidates, seen, raw, 'bare-id');
  }

  return candidates;
}

export function extractClaapRecordingId(input: string): string {
  return extractClaapRecordingCandidates(input)[0]?.id || '';
}

export function formatClaapTitleFromUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    const segment = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    const withoutIds = segment.replace(CLAAP_SHARE_SEGMENT, '').replace(/[-_]+/g, ' ').trim();
    if (!withoutIds) return 'Claap recording';
    return withoutIds.replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Claap recording';
  }
}