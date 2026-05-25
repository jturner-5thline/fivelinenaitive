import type { Deal } from '@/types/deal';

export interface LinkedDealContactLike {
  name?: string | null;
  email?: string | null;
}

export const EMPTY_CLIENT_CONTACT_LABEL = 'No client contact set';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/i;

export function resolveDealClientContact(
  deal: Pick<Deal, 'contact' | 'contactInfo' | 'contactEmail'>,
  linkedContact?: LinkedDealContactLike | null,
) {
  const linkedName = linkedContact?.name?.trim() || '';
  const linkedEmail = linkedContact?.email?.trim() || '';
  const legacyName = deal.contact?.trim() || '';
  const legacyInfo = deal.contactInfo?.trim() || deal.contactEmail?.trim() || '';

  const name = linkedName || legacyName || null;
  const info = linkedEmail || legacyInfo || null;
  const email = info?.match(EMAIL_RE)?.[0] ?? null;

  return {
    name,
    info,
    email,
    isLinked: Boolean(linkedName),
    isEmpty: !name,
  };
}