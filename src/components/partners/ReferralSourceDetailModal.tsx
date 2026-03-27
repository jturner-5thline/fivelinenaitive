import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Hash, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import type { ReferralSourceRecord } from '@/hooks/useReferralSourcesPipeline';

interface Props {
  source: ReferralSourceRecord;
  onClose: () => void;
  ownerMap: Map<string, string>;
}

export function ReferralSourceDetailModal({ source, onClose, ownerMap }: Props) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {source.name}
            {source.promoted_to_partner_id && (
              <Badge variant="outline" className="text-[10px] border-emerald-600 text-emerald-400">In Pipeline</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider">Type</span>
              <p className="text-white mt-0.5">{source.type}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider"># Referrals</span>
              <p className="text-white mt-0.5 flex items-center gap-1">
                <Hash className="h-3 w-3 text-slate-500" /> {source.number_of_referrals}
              </p>
            </div>
          </div>

          {(source.contact_name || source.contact_email) && (
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider">Contact</span>
              <div className="mt-1 space-y-1">
                {source.contact_name && (
                  <p className="text-sm text-white flex items-center gap-1.5">
                    <User className="h-3 w-3 text-slate-500" /> {source.contact_name}
                  </p>
                )}
                {source.contact_email && (
                  <p className="text-sm text-slate-300 flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-slate-500" /> {source.contact_email}
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <span className="text-slate-400 text-xs uppercase tracking-wider">Relationship Owner</span>
            {source.relationship_owner_id ? (
              <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--primary))' }}>
                {ownerMap.get(source.relationship_owner_id) || 'Unknown'}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">Unassigned</p>
            )}
          </div>

          <div>
            <span className="text-slate-400 text-xs uppercase tracking-wider">Date Added</span>
            <p className="text-sm text-white mt-0.5 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-slate-500" />
              {format(new Date(source.created_at), 'MMMM d, yyyy')}
            </p>
          </div>

          {source.notes && (
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider">Notes</span>
              <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{source.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
