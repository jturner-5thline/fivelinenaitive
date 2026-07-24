import { useState, useEffect, useCallback } from 'react';
import { Trash2, Pencil, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePipelineStages, useUpdatePartner, useDeletePartner, type Partner } from '@/hooks/usePartnersPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { PartnerMemoModal } from '@/components/partners/PartnerMemoModal';
import { PartnerLinkedCompanyContacts } from '@/components/partners/PartnerLinkedCompanyContacts';
import { PartnerPromotionDialog, getPromotionMode, type PromotionMode, type PromotionResult } from '@/components/partners/PartnerPromotionDialog';
import { PartnerTierBadge, PartnerTier4WarningBadge } from '@/components/partners/PartnerTierBadge';
import { PartnerTierExplainer } from '@/components/partners/PartnerTierExplainer';
import { usePartnerTier, PARTNER_TIER_OVERRIDE_EMAILS, type AutoTier } from '@/hooks/usePartnerTier';
import { PartnerTierHistoryPanel } from '@/components/partners/PartnerTierHistoryPanel';
import {
  useRecordPartnerTierAuto,
  recordPartnerTierOverride,
  recordPartnerTierOverrideCleared,
} from '@/hooks/usePartnerTierHistory';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface StageNote {
  note: string;
  user_name: string;
  created_at: string;
  from_stage_name?: string;
  to_stage_name?: string;
}

const PARTNER_TYPES = ['Channel', 'Branding', 'Connector'];

export function PartnerDetailPanel({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const { data: stages = [] } = usePipelineStages();
  const teamMembers = useTeamMembers();
  const updatePartner = useUpdatePartner();
  const del = useDeletePartner();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [firmType, setFirmType] = useState('');
  const [stageId, setStageId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [showMemo, setShowMemo] = useState(false);
  const [hasUnseenMemoChanges, setHasUnseenMemoChanges] = useState(false);

  // Stage move confirmation state
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [stageMoveNote, setStageMoveNote] = useState('');
  const [showStageMoveConfirm, setShowStageMoveConfirm] = useState(false);
  const [stageMoveSubmitting, setStageMoveSubmitting] = useState(false);

  // Promotion (Trial / Active Partner) dialog state
  const [promotion, setPromotion] = useState<{ stageId: string; mode: PromotionMode } | null>(null);
  const [promotionSubmitting, setPromotionSubmitting] = useState(false);

  // Latest stage note state
  const [latestStageNote, setLatestStageNote] = useState<StageNote | null>(null);
  const [stageHistory, setStageHistory] = useState<StageNote[]>([]);
  const [stageHistoryOpen, setStageHistoryOpen] = useState(false);

  // Tier override
  const { data: tierInfo } = usePartnerTier(partner);
  useRecordPartnerTierAuto(partner?.id, tierInfo);
  const canOverrideTier = !!user?.email && PARTNER_TIER_OVERRIDE_EMAILS.includes(user.email.toLowerCase());
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTier, setOverrideTier] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');

  const handleSaveTierOverride = async (clear = false) => {
    if (!partner) return;
    const meta = { ...((partner.metadata || {}) as Record<string, any>) };
    if (clear) {
      delete meta.tierOverride;
    } else {
      if (!overrideTier || !overrideReason.trim()) {
        toast.error('Tier and reason are required');
        return;
      }
      meta.tierOverride = {
        tier: Number(overrideTier) as AutoTier,
        reason: overrideReason.trim(),
        by: user?.email || user?.id || null,
        at: new Date().toISOString(),
      };
    }
    updatePartner.mutate(
      { id: partner.id, metadata: meta },
      {
        onSuccess: async () => {
          try {
            if (clear) {
              await recordPartnerTierOverrideCleared({
                partnerId: partner.id,
                fallbackTier: (tierInfo?.tier || 4) as AutoTier,
                thresholds: tierInfo
                  ? {
                      qualifiedTrailing3mo: tierInfo.qualifiedTrailing3mo,
                      signedTrailing3mo: tierInfo.signedTrailing3mo,
                      addedToBoardTrailing3mo: tierInfo.addedToBoardTrailing3mo,
                      addedToBoardTrailing12mo: tierInfo.addedToBoardTrailing12mo,
                      totalDeals: tierInfo.totalDeals,
                    }
                  : null,
              });
            } else {
              await recordPartnerTierOverride({
                partnerId: partner.id,
                toTier: Number(overrideTier) as AutoTier,
                reason: overrideReason.trim(),
                thresholds: tierInfo
                  ? {
                      qualifiedTrailing3mo: tierInfo.qualifiedTrailing3mo,
                      signedTrailing3mo: tierInfo.signedTrailing3mo,
                      addedToBoardTrailing3mo: tierInfo.addedToBoardTrailing3mo,
                      addedToBoardTrailing12mo: tierInfo.addedToBoardTrailing12mo,
                      totalDeals: tierInfo.totalDeals,
                    }
                  : null,
              });
            }
          } catch {
            /* best-effort */
          }
          toast.success(clear ? 'Tier override cleared' : 'Tier override applied');
          setOverrideOpen(false);
          setOverrideReason('');
          setOverrideTier('');
        },
      },
    );
  };

  const checkUnseenMemoChanges = useCallback(async () => {
    if (!partner?.id || !user?.id) { setHasUnseenMemoChanges(false); return; }

    const { data: receipt } = await supabase
      .from('partner_memo_read_receipts' as any)
      .select('last_seen_audit_id')
      .eq('partner_id', partner.id)
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: latestAudit } = await supabase
      .from('partner_memo_audit_log' as any)
      .select('id')
      .eq('partner_id', partner.id)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestAudit) { setHasUnseenMemoChanges(false); return; }

    const lastSeenId = (receipt as any)?.last_seen_audit_id;
    setHasUnseenMemoChanges(!lastSeenId || lastSeenId !== (latestAudit as any).id);
  }, [partner?.id, user?.id]);

  const fetchLatestStageNote = useCallback(async () => {
    if (!partner?.id) { setLatestStageNote(null); setStageHistory([]); return; }
    const { data: allNotes } = await supabase
      .from('partner_stage_notes' as any)
      .select('note, user_id, created_at, from_stage, to_stage')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!allNotes || (allNotes as any[]).length === 0) {
      setLatestStageNote(null); setStageHistory([]); return;
    }
    const notes = allNotes as any[];
    // Resolve user names
    const userIds = [...new Set(notes.map(n => n.user_id).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, email').in('user_id', userIds);
      (profiles as any[] || []).forEach(p => { userMap[p.user_id] = p.display_name || p.email || 'Unknown'; });
    }
    // Build stage name lookup from current stages
    const stageMap: Record<string, string> = {};
    stages.forEach(s => { stageMap[s.id] = s.name; });

    const mapped: StageNote[] = notes.map(n => ({
      note: n.note,
      user_name: userMap[n.user_id] || 'Unknown',
      created_at: n.created_at,
      from_stage_name: n.from_stage ? stageMap[n.from_stage] || 'Unknown' : undefined,
      to_stage_name: n.to_stage ? stageMap[n.to_stage] || 'Unknown' : undefined,
    }));
    setLatestStageNote(mapped[0]);
    setStageHistory(mapped);
  }, [partner?.id, stages]);

  useEffect(() => {
    if (partner) {
      setName(partner.name);
      setFirmType(partner.firm_type);
      setStageId(partner.stage_id || '');
      setOwnerId(partner.owner_id || '');
      setNotes(partner.notes);
      setEditing(false);
      checkUnseenMemoChanges();
      fetchLatestStageNote();
    }
  }, [partner, checkUnseenMemoChanges, fetchLatestStageNote]);

  const handleSave = () => {
    if (!partner) return;
    updatePartner.mutate({
      id: partner.id,
      name: name.trim(),
      firm_type: firmType,
      stage_id: stageId || null,
      owner_id: ownerId || null,
      notes,
    }, { onSuccess: () => setEditing(false) });
  };

  const handleDelete = () => {
    if (!partner) return;
    del.mutate(partner.id, { onSuccess: onClose });
  };

  const handleStageSelect = (newStageId: string) => {
    if (!partner || newStageId === partner.stage_id) return;
    const targetStage = stages.find(s => s.id === newStageId);
    const mode = getPromotionMode(targetStage?.name);
    if (mode) {
      setPromotion({ stageId: newStageId, mode });
      return;
    }
    setPendingStageId(newStageId);
    setStageMoveNote('');
    setShowStageMoveConfirm(true);
  };

  const handlePromotionConfirm = async (result: PromotionResult) => {
    if (!partner || !promotion || !user?.id || !company?.id) return;
    setPromotionSubmitting(true);
    try {
      await supabase.from('partner_stage_notes' as any).insert({
        partner_id: partner.id,
        user_id: user.id,
        company_id: company.id,
        from_stage: partner.stage_id || null,
        to_stage: promotion.stageId,
        note: result.note,
      });
      const existingMeta = (partner.metadata || {}) as Record<string, any>;
      const promotions = { ...(existingMeta.promotions || {}) };
      promotions[result.mode] = {
        at: new Date().toISOString(),
        by: user.id,
        trialChecks: result.trialChecks,
        publicConfirmed: result.publicConfirmed,
        override: result.override,
        overrideReason: result.overrideReason,
        autoCriteriaSnapshot: result.autoCriteriaSnapshot,
      };
      updatePartner.mutate(
        { id: partner.id, stage_id: promotion.stageId, metadata: { ...existingMeta, promotions } },
        { onSuccess: () => { fetchLatestStageNote(); toast.success(`Moved to ${promotion.mode === 'trial' ? 'Trial' : 'Active Partner'}`); } },
      );
      setPromotion(null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to promote partner');
    } finally {
      setPromotionSubmitting(false);
    }
  };

  const handleStageMoveConfirm = async () => {
    if (!partner || !pendingStageId || !stageMoveNote.trim() || !user?.id || !company?.id) return;
    setStageMoveSubmitting(true);
    try {
      // Insert stage note
      await supabase.from('partner_stage_notes' as any).insert({
        partner_id: partner.id,
        user_id: user.id,
        company_id: company.id,
        from_stage: partner.stage_id || null,
        to_stage: pendingStageId,
        note: stageMoveNote.trim(),
      });
      // Move the partner
      updatePartner.mutate({ id: partner.id, stage_id: pendingStageId }, {
        onSuccess: () => {
          fetchLatestStageNote();
          toast.success('Partner moved to new stage');
        },
      });
      setShowStageMoveConfirm(false);
      setPendingStageId(null);
      setStageMoveNote('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to move stage');
    } finally {
      setStageMoveSubmitting(false);
    }
  };

  const handleStageMoveCancel = () => {
    setShowStageMoveConfirm(false);
    setPendingStageId(null);
    setStageMoveNote('');
  };

  const currentStage = stages.find(s => s.id === (editing ? stageId : partner?.stage_id));
  const pendingStageName = stages.find(s => s.id === pendingStageId)?.name || '';
  const ownerMember = teamMembers.find((m: any) => m.id === (editing ? ownerId : partner?.owner_id));

  return (
    <>
    <Dialog open={!!partner} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[90vw] w-[90vw] max-h-[88vh] h-[88vh] p-0 bg-slate-800 border-slate-700 text-white overflow-hidden">
        {partner && (
          <div className="grid h-full overflow-auto md:overflow-hidden grid-cols-1 md:[grid-template-columns:minmax(280px,25%)_1fr]">
            {/* Left Column - Partner Info (25%) */}
            <div className="border-b md:border-b-0 md:border-r border-slate-700 p-6 flex flex-col md:overflow-y-auto">
              {/* Header */}
              <div className="mb-6">
                {editing ? (
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="text-xl font-semibold bg-slate-900 border-slate-600 text-white"
                  />
                ) : (
                  <h2 className="text-xl font-semibold text-white">{partner.name}</h2>
                )}
                <p className="text-xs text-slate-500 mt-1">Added {format(new Date(partner.created_at), 'MMM d, yyyy')}</p>
                <div className="mt-3 flex items-center flex-wrap gap-1.5">
                  <PartnerTierBadge info={tierInfo} size="md" />
                  <PartnerTierExplainer info={tierInfo} />
                  <PartnerTier4WarningBadge info={tierInfo} />
                  {canOverrideTier && (
                    <Popover open={overrideOpen} onOpenChange={setOverrideOpen}>
                      <PopoverTrigger asChild>
                        <button
                          className="text-[10px] text-slate-400 hover:text-white underline underline-offset-2"
                          onClick={() => {
                            setOverrideTier(tierInfo ? String(tierInfo.tier) : '');
                            setOverrideReason(tierInfo?.overrideReason || '');
                          }}
                        >
                          {tierInfo?.manualOverride ? 'Edit override' : 'Override tier'}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 bg-slate-900 border-slate-700 text-white" align="start">
                        <div className="space-y-2">
                          <Label className="text-xs">Tier</Label>
                          <Select value={overrideTier} onValueChange={setOverrideTier}>
                            <SelectTrigger className="bg-slate-800 border-slate-600 text-white"><SelectValue placeholder="Select tier" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Tier 1</SelectItem>
                              <SelectItem value="2">Tier 2</SelectItem>
                              <SelectItem value="3">Tier 3</SelectItem>
                              <SelectItem value="4">Tier 4</SelectItem>
                            </SelectContent>
                          </Select>
                          <Label className="text-xs">Reason</Label>
                          <Textarea
                            value={overrideReason}
                            onChange={e => setOverrideReason(e.target.value)}
                            rows={3}
                            className="bg-slate-800 border-slate-600 text-white"
                            placeholder="Why are you overriding the auto-calculated tier?"
                          />
                          <div className="flex justify-between gap-2 pt-1">
                            {tierInfo?.manualOverride ? (
                              <Button size="sm" variant="outline" onClick={() => handleSaveTierOverride(true)}>Clear</Button>
                            ) : <span />}
                            <Button size="sm" onClick={() => handleSaveTierOverride(false)}>Save override</Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {tierInfo?.manualOverride && tierInfo.overrideReason && (
                  <p className="text-[10px] text-slate-500 mt-1">Override: {tierInfo.overrideReason}</p>
                )}
                <div className="mt-3">
                  <PartnerTierHistoryPanel partnerId={partner.id} />
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-5 flex-1">
                {/* Type */}
                <div>
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">Type</Label>
                  {editing ? (
                    <Select value={firmType} onValueChange={setFirmType}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PARTNER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={partner.firm_type || ''} onValueChange={(v) => updatePartner.mutate({ id: partner.id, firm_type: v })}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {PARTNER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Relationship Owner */}
                <div>
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">Relationship Owner</Label>
                  {editing ? (
                    <Select value={ownerId} onValueChange={setOwnerId}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="Select owner" /></SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={partner.owner_id || 'unassigned'} onValueChange={(v) => updatePartner.mutate({ id: partner.id, owner_id: v === 'unassigned' ? null : v })}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="Select owner" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Stage with popover for latest note */}
                <div>
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">Stage</Label>
                  {editing ? (
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 mt-1 cursor-pointer hover:bg-slate-700/50 rounded px-1.5 py-1 -mx-1.5 transition-colors group">
                          {currentStage && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: currentStage.color }} />}
                          <span className="text-sm text-white group-hover:underline">{currentStage?.name || 'Unassigned'}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 bg-slate-900 border-slate-700 text-white p-3" side="right" align="start">
                        {latestStageNote ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <p className="text-xs text-slate-400">
                                Moved by <span className="text-slate-300 font-medium">{latestStageNote.user_name}</span> on{' '}
                                {format(new Date(latestStageNote.created_at), 'MMM d, yyyy')}
                              </p>
                              <p className="text-sm text-slate-200 leading-relaxed">{latestStageNote.note}</p>
                            </div>

                            {stageHistory.length > 1 && (
                              <div className="border-t border-slate-700 pt-2">
                                <button
                                  onClick={() => setStageHistoryOpen(!stageHistoryOpen)}
                                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors font-medium"
                                >
                                  {stageHistoryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  View Stage History ({stageHistory.length})
                                </button>
                                {stageHistoryOpen && (
                                  <div className="mt-2 space-y-2.5 max-h-48 overflow-y-auto pr-1">
                                    {stageHistory.map((entry, i) => (
                                      <div key={i} className="text-xs">
                                        <p className="text-slate-300">
                                          <span className="font-medium">{entry.from_stage_name || '—'}</span>
                                          {' → '}
                                          <span className="font-medium">{entry.to_stage_name || '—'}</span>
                                        </p>
                                        <p className="text-slate-400 mt-0.5 italic">"{entry.note}"</p>
                                        <p className="text-slate-500 mt-0.5">{entry.user_name}, {format(new Date(entry.created_at), 'MMM d, yyyy')}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">No stage move note recorded.</p>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* Move to Stage (non-edit mode quick action) */}
                {!editing && (
                  <div>
                    <Label className="text-xs text-slate-400 uppercase tracking-wider">Move to Stage</Label>
                    <Select
                      value={partner.stage_id || ''}
                      onValueChange={handleStageSelect}
                    >
                      <SelectTrigger className="mt-1.5 h-9 text-sm bg-slate-900 border-slate-600 text-white">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Partner Memo Button */}
              <div>
                <Button size="sm" variant="outline" onClick={() => setShowMemo(true)} className="gap-1.5 w-full relative">
                  <FileText className="h-3.5 w-3.5" /> Partner Memo
                  {hasUnseenMemoChanges && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-slate-800" />
                  )}
                </Button>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-slate-700 mt-4">
                {editing ? (
                  <>
                    <Button size="sm" onClick={handleSave} disabled={updatePartner.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                <div className="ml-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete partner?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove {partner.name} from the pipeline.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>

            {/* Right Column - Content (75%) */}
            <div className="overflow-y-auto p-6 space-y-0 min-w-0">
              {/* Linked Company & Contacts */}
              <div className="pb-5">
                <PartnerLinkedCompanyContacts partnerId={partner.id} />
              </div>

              <div className="border-t border-slate-700" />

              {/* Referred Deals */}
              <div className="py-5">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Referred Deals</h3>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
                  <p className="text-sm text-slate-400">No referred deals found.</p>
                  <p className="text-xs text-slate-500 mt-1">Deals where this partner is the referral source will appear here.</p>
                </div>
              </div>

              <div className="border-t border-slate-700" />

              {/* Activity History */}
              <div className="py-5">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Activity History</h3>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
                  <p className="text-sm text-slate-400">No activity history yet.</p>
                  <p className="text-xs text-slate-500 mt-1">Meetings, emails, and interactions will appear here.</p>
                </div>
              </div>

              <div className="border-t border-slate-700" />

              {/* Notes */}
              <div className="pt-5">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Notes</h3>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Write notes about this partner..."
                  className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                />
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (!partner) return;
                    updatePartner.mutate({ id: partner.id, notes });
                  }}
                  disabled={updatePartner.isPending || notes === partner.notes}
                >
                  Save Notes
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Stage Move Confirmation Dialog */}
    <Dialog open={showStageMoveConfirm} onOpenChange={(v) => { if (!v) handleStageMoveCancel(); }}>
      <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg">Move to {pendingStageName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-slate-400">
            Please provide a note explaining why this partner is being moved to <span className="text-white font-medium">{pendingStageName}</span>.
          </p>
          <Textarea
            value={stageMoveNote}
            onChange={e => setStageMoveNote(e.target.value)}
            rows={3}
            placeholder="Reason for stage change…"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={handleStageMoveCancel}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleStageMoveConfirm}
              disabled={!stageMoveNote.trim() || stageMoveSubmitting}
            >
              {stageMoveSubmitting ? 'Moving…' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {partner && (
      <PartnerMemoModal
        open={showMemo}
        onOpenChange={setShowMemo}
        partnerId={partner.id}
        partnerName={partner.name}
        onReadReceiptUpdated={() => setHasUnseenMemoChanges(false)}
      />
    )}
    {partner && promotion && (
      <PartnerPromotionDialog
        open={!!promotion}
        mode={promotion.mode}
        partnerName={partner.name}
        onCancel={() => setPromotion(null)}
        onConfirm={handlePromotionConfirm}
        submitting={promotionSubmitting}
      />
    )}
    </>
  );
}
