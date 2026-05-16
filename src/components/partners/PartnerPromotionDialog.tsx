import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { usePartnerPromotionCriteria } from '@/hooks/usePartnerPromotionCriteria';
import { usePartnerRules, DEFAULT_PARTNER_RULES } from '@/hooks/usePartnerRules';

export type PromotionMode = 'trial' | 'active-partner';

const TRIAL_DESCRIPTIONS: Record<string, string> = {
  fit: 'Client profile alignment',
  responsiveness: 'Timeliness and openness to engage',
  engagement: 'Participation in calls, enablement, or information sharing',
  contribution: 'Client base, influence, and overlap with 5th Line focus areas',
};

export interface PromotionResult {
  mode: PromotionMode;
  trialChecks?: Record<string, boolean>;
  publicConfirmed?: boolean;
  override?: boolean;
  overrideReason?: string;
  autoCriteriaSnapshot?: Record<string, unknown>;
  note: string;
}

interface Props {
  open: boolean;
  mode: PromotionMode;
  partnerName: string;
  onCancel: () => void;
  onConfirm: (result: PromotionResult) => void;
  submitting?: boolean;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function PartnerPromotionDialog({ open, mode, partnerName, onCancel, onConfirm, submitting }: Props) {
  const [trialChecks, setTrialChecks] = useState<Record<string, boolean>>({});
  const [publicConfirmed, setPublicConfirmed] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [note, setNote] = useState('');
  const { data: rules } = usePartnerRules();
  const trialLabels = rules?.stages.trial.labels || DEFAULT_PARTNER_RULES.stages.trial.labels;
  const ap = rules?.stages.activePartner || DEFAULT_PARTNER_RULES.stages.activePartner;
  const trialCriteria = [
    { id: 'fit', label: trialLabels.fit, desc: TRIAL_DESCRIPTIONS.fit },
    { id: 'responsiveness', label: trialLabels.responsiveness, desc: TRIAL_DESCRIPTIONS.responsiveness },
    { id: 'engagement', label: trialLabels.engagement, desc: TRIAL_DESCRIPTIONS.engagement },
    { id: 'contribution', label: trialLabels.contribution, desc: TRIAL_DESCRIPTIONS.contribution },
  ];

  useEffect(() => {
    if (open) {
      setTrialChecks({}); setPublicConfirmed(false); setOverrideReason(''); setNote('');
    }
  }, [open, mode]);

  const { data: criteria, isLoading } = usePartnerPromotionCriteria(open && mode === 'active-partner' ? partnerName : null);

  const trialMetCount = Object.values(trialChecks).filter(Boolean).length;
  const apAutoMet = !!criteria && criteria.metCount >= 1;
  const publicOk = !ap.publicPartnershipRequired || publicConfirmed;
  const apReqsMet = apAutoMet && publicOk;
  const apCanProceed = apReqsMet || overrideReason.trim().length > 0;

  const handleConfirm = () => {
    if (mode === 'trial') {
      onConfirm({
        mode, trialChecks,
        note: note.trim() || `Moved to Trial (${trialMetCount}/4 criteria met)`,
      });
    } else {
      onConfirm({
        mode, publicConfirmed,
        override: !apReqsMet,
        overrideReason: overrideReason.trim() || undefined,
        autoCriteriaSnapshot: criteria as any,
        note: note.trim() || (apReqsMet
          ? `Promoted to Active Partner (${criteria?.metCount}/3 auto criteria met, public partnership confirmed)`
          : `Manual override to Active Partner: ${overrideReason.trim()}`),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>
            {mode === 'trial' ? 'Confirm move to Trial' : 'Promote to Active Partner'}
          </DialogTitle>
        </DialogHeader>

        {mode === 'trial' ? (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-slate-400">
              Check all criteria that apply for <span className="text-white font-medium">{partnerName}</span>.
            </p>
            <div className="space-y-2">
              {trialCriteria.map(c => (
                <label key={c.id} className="flex items-start gap-2.5 p-2.5 rounded-md border border-slate-700 bg-slate-900/50 cursor-pointer hover:border-slate-600">
                  <Checkbox
                    checked={!!trialChecks[c.id]}
                    onCheckedChange={(v) => setTrialChecks(prev => ({ ...prev, [c.id]: !!v }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{c.label}</div>
                    <div className="text-xs text-slate-400">{c.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div>
              <Label className="text-xs text-slate-400">Note (optional)</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                className="mt-1 bg-slate-900 border-slate-600 text-white" />
            </div>
            <p className="text-xs text-slate-500">{trialMetCount} of 4 criteria checked. You may proceed even if none are checked.</p>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-slate-400">
              Auto-calculated criteria for <span className="text-white font-medium">{partnerName}</span> (trailing periods):
            </p>
            {isLoading ? (
              <p className="text-sm text-slate-500">Calculating…</p>
            ) : (
              <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 space-y-2">
                <CriteriaRow met={!!criteria?.details.proposals}
                  label={`${ap.referralToProposalThreshold}+ referrals to Proposal Issued (last ${ap.referralToProposalMonths}mo)`}
                  value={`${criteria?.proposalsCount ?? 0} in last ${ap.referralToProposalMonths} months`} />
                <CriteriaRow met={!!criteria?.details.signed}
                  label={`≥${ap.signedClientThreshold} signed client (last ${ap.signedClientMonths}mo)`}
                  value={`${criteria?.signedCount ?? 0} signed`} />
                <CriteriaRow met={!!criteria?.details.revenue}
                  label={`Referred revenue ≥ ${fmt$(ap.referredRevenueThreshold)} (last ${ap.referredRevenueMonths}mo)`}
                  value={fmt$(criteria?.ttmRevenue ?? 0)} />
                <div className="border-t border-slate-700 pt-2 text-xs text-slate-400">
                  {criteria?.metCount ?? 0} of 3 auto criteria met (need ≥1).
                </div>
              </div>
            )}

            {ap.publicPartnershipRequired && (
              <label className="flex items-start gap-2.5 p-2.5 rounded-md border border-slate-700 bg-slate-900/50 cursor-pointer">
                <Checkbox checked={publicConfirmed} onCheckedChange={(v) => setPublicConfirmed(!!v)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">Public-facing partnership confirmed</div>
                  <div className="text-xs text-slate-400">Public announcement, website mention, or joint marketing</div>
                </div>
              </label>
            )}

            {!apReqsMet && (
              <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2 text-amber-200 text-xs">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>This partner does not yet meet Active Partner requirements. You can still promote manually with a reason.</span>
                </div>
                <Textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={2}
                  placeholder="Reason for manual override…"
                  className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" />
              </div>
            )}

            <div>
              <Label className="text-xs text-slate-400">Note (optional)</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                className="mt-1 bg-slate-900 border-slate-600 text-white" />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm}
            disabled={submitting || (mode === 'active-partner' && !apCanProceed)}>
            {submitting ? 'Moving…' : mode === 'trial' ? 'Move to Trial' : (apReqsMet ? 'Promote' : 'Promote with override')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CriteriaRow({ met, label, value }: { met: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {met ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
           : <XCircle className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />}
      <div className="flex-1">
        <div className={met ? 'text-white' : 'text-slate-300'}>{label}</div>
        <div className="text-xs text-slate-500">{value}</div>
      </div>
    </div>
  );
}

export function isTrialStageName(name?: string | null) {
  const n = (name || '').toLowerCase();
  return n === 'trial' || n.includes('trial');
}
export function isActivePartnerStageName(name?: string | null) {
  return (name || '').toLowerCase() === 'active partner';
}
export function getPromotionMode(name?: string | null): PromotionMode | null {
  if (isActivePartnerStageName(name)) return 'active-partner';
  if (isTrialStageName(name)) return 'trial';
  return null;
}
