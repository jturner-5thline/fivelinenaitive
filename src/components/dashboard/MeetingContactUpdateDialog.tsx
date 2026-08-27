import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, Search, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { AddToNurturingButton } from '@/components/contacts/AddToNurturingButton';
import { useCompany } from '@/hooks/useCompany';


interface Attendee { email?: string | null; displayName?: string | null; self?: boolean; responseStatus?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendees: Attendee[];
  organizerEmail?: string | null;
  eventTitle?: string;
  claapSummary?: string | null;
}

const INTERNAL_DOMAINS = ['naitive.co', '5thline.co'];

function splitName(display?: string | null, email?: string | null): { first: string; last: string } {
  const raw = (display || '').trim();
  if (raw && !raw.includes('@')) {
    const parts = raw.split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') };
  }
  const local = (email || '').split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  return {
    first: parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : '',
    last: parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1) : '',
  };
}

export function MeetingContactUpdateDialog({ open, onOpenChange, attendees, organizerEmail, eventTitle, claapSummary }: Props) {
  const { company } = useCompany();
  const claapNote = useMemo(() => {
    const body = (claapSummary || '').trim();
    if (!body) return '';
    const header = `Claap Summary${eventTitle ? ` — ${eventTitle}` : ''}`;
    return `${header}\n${body}`;
  }, [claapSummary, eventTitle]);

  const withClaapNote = (existing?: string | null) => {
    if (!claapNote) return existing || '';
    const prev = (existing || '').trim();
    if (prev.includes(claapNote)) return prev;
    return prev ? `${prev}\n\n${claapNote}` : claapNote;
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [nurtureEmailOpen, setNurtureEmailOpen] = useState(false);
  const [editContact, setEditContact] = useState<any | null>(null);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const list: { email: string; name: string; first: string; last: string }[] = [];
    for (const a of attendees || []) {
      const email = (a?.email || '').trim().toLowerCase();
      if (!email || a?.self) continue;
      const domain = email.split('@')[1] || '';
      if (INTERNAL_DOMAINS.includes(domain)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      const { first, last } = splitName(a.displayName, email);
      list.push({ email, name: (a.displayName || `${first} ${last}`).trim(), first, last });
    }
    if (list.length === 0 && organizerEmail) {
      const email = organizerEmail.toLowerCase();
      const { first, last } = splitName(null, email);
      list.push({ email, name: `${first} ${last}`.trim(), first, last });
    }
    return list;
  }, [attendees, organizerEmail]);

  const [activeIdx, setActiveIdx] = useState(0);
  const active = candidates[Math.min(activeIdx, Math.max(candidates.length - 1, 0))];

  const { data: matches, isLoading } = useQuery({
    queryKey: ['meeting-contact-match', company?.id, active?.email, active?.first, active?.last],
    enabled: open && !!active && !!company?.id,
    queryFn: async () => {
      if (!active || !company?.id) return [];

      // Email is authoritative. Query it separately so punctuation in an email
      // cannot be misinterpreted by PostgREST's comma-delimited `.or()` syntax.
      if (active.email) {
        const { data: emailMatches, error: emailError } = await supabase
          .from('contacts')
          .select('*')
          .eq('org_company_id', company.id)
          .ilike('email', active.email.trim())
          .limit(10);
        if (emailError) throw emailError;
        if (emailMatches?.length) return emailMatches;
      }

      const filters: string[] = [];
      if (active.first) filters.push(`first_name.ilike.%${active.first}%`);
      if (active.last) filters.push(`last_name.ilike.%${active.last}%`);
      if (active.name) filters.push(`full_name.ilike.%${active.name}%`);
      if (filters.length === 0) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('org_company_id', company.id)
        .or(filters.join(','))
        .limit(10);
      if (error) throw error;
      // Exact email matches first
      return (data || []).sort((a: any, b: any) => {
        const ae = (a.email || '').toLowerCase() === active.email ? 0 : 1;
        const be = (b.email || '').toLowerCase() === active.email ? 0 : 1;
        return ae - be;
      });
    },
  });

  return (
    <>
      {/* Hide this dialog while the contact form / email flow is on screen */}
      <Dialog open={open && !createOpen && !editContact && !nurtureEmailOpen} onOpenChange={onOpenChange}>

        <DialogContent
          className="max-w-lg z-[1420] border-white/10 bg-[#171B2C] text-white"
          overlayClassName="z-[1410]"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-white">Update Contact</DialogTitle>
            <DialogDescription className="text-white/60">
              {eventTitle ? `From “${eventTitle}”. ` : ''}We searched your contacts for this attendee.
            </DialogDescription>
          </DialogHeader>

          {candidates.length === 0 ? (
            <p className="text-sm text-white/60">No external attendees found on this invite.</p>
          ) : (
            <div className="space-y-3">
              {candidates.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((c, i) => (
                    <button
                      key={c.email}
                      onClick={() => setActiveIdx(i)}
                      className={`rounded-md border px-2 py-1 text-xs ${i === activeIdx ? 'border-primary/50 bg-primary/15 text-white' : 'border-white/10 bg-white/[0.04] text-white/70'}`}
                    >
                      {c.name || c.email}
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="text-sm font-medium text-white">{active?.name || '—'}</div>
                <div className="flex items-center gap-1.5 text-xs text-white/60">
                  <Mail className="h-3 w-3" /> {active?.email}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-white/50">
                  <Search className="h-3 w-3" /> Potential existing contacts
                </div>
                {isLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching contacts…
                  </div>
                ) : (matches || []).length === 0 ? (
                  <p className="py-2 text-sm text-white/60">No matching contacts found.</p>
                ) : (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {(matches || []).map((m: any) => {
                      const exact = (m.email || '').toLowerCase() === active?.email;
                      return (
                        <div
                          key={m.id}
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-left"
                        >
                          <button
                            onClick={() => setEditContact(m)}
                            className="min-w-0 flex-1 text-left hover:opacity-80"
                          >
                            <div className="truncate text-sm text-white">
                              {m.full_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email}
                            </div>
                            <div className="truncate text-xs text-white/55">
                              {[m.email, m.job_title, m.hs_company_name].filter(Boolean).join(' · ')}
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {exact && <Badge className="shrink-0 bg-emerald-500/20 text-emerald-200">Email match</Badge>}
                            <AddToNurturingButton
                              contact={m}
                              onEmailFlowChange={(o) => { setNurtureEmailOpen(o); if (!o) onOpenChange(false); }}
                            />
                          </div>
                        </div>
                      );
                    })}

                  </div>
                )}
              </div>

              <Button
                variant="outline"
                className="w-full gap-1.5 border-primary/30 bg-primary/[0.08] text-white hover:bg-primary/[0.16]"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus className="h-4 w-4" /> None of these — create new contact
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Existing contact → open the same form fully pre-filled for editing */}
      <CreateContactModal
        contentClassName="z-[1520]"
        overlayClassName="z-[1510]"
        open={!!editContact}
        contactId={editContact?.id || null}
        onClose={() => setEditContact(null)}
        initialValues={editContact ? { ...editContact, description: withClaapNote(editContact.description) } : undefined}
        onCreated={() => { setEditContact(null); onOpenChange(false); }}
      />

      <CreateContactModal
        contentClassName="z-[1520]"
        overlayClassName="z-[1510]"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialValues={active ? { first_name: active.first, last_name: active.last, email: active.email, description: withClaapNote(null) } : undefined}
        onSaveSuccess={() => onOpenChange(false)}
        onCreated={() => { setCreateOpen(false); onOpenChange(false); }}
      />
    </>
  );
}
