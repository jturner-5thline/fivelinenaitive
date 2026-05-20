const activeDraftsByDeal = new Map<string, Set<string>>();

function getFieldSet(dealId: string) {
  let fields = activeDraftsByDeal.get(dealId);
  if (!fields) {
    fields = new Set<string>();
    activeDraftsByDeal.set(dealId, fields);
  }
  return fields;
}

export function activateDealDraft(dealId: string, fieldName: string) {
  getFieldSet(dealId).add(fieldName);
}

export function clearDealDraft(dealId: string, fieldName: string) {
  const fields = activeDraftsByDeal.get(dealId);
  if (!fields) return;
  fields.delete(fieldName);
  if (fields.size === 0) {
    activeDraftsByDeal.delete(dealId);
  }
}

export function hasActiveDealDrafts(dealId?: string | null) {
  if (!dealId) {
    return activeDraftsByDeal.size > 0;
  }
  return (activeDraftsByDeal.get(dealId)?.size ?? 0) > 0;
}

export function getActiveDealDraftFields(dealId?: string | null) {
  if (!dealId) return new Set<string>();
  return new Set(activeDraftsByDeal.get(dealId) ?? []);
}