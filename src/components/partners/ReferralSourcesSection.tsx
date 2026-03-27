import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, ArrowRightCircle, Check, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useReferralSourcesList, type ReferralSourceRecord } from '@/hooks/useReferralSourcesPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { AddReferralSourceDialog } from './AddReferralSourceDialog';
import { ReferralSourceDetailModal } from './ReferralSourceDetailModal';
import { PromoteToPipelineDialog } from './PromoteToPipelineDialog';

export function ReferralSourcesSection() {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editSource, setEditSource] = useState<ReferralSourceRecord | null>(null);
  const [detailSource, setDetailSource] = useState<ReferralSourceRecord | null>(null);
  const [promoteSource, setPromoteSource] = useState<ReferralSourceRecord | null>(null);

  const { data: sources = [] } = useReferralSourcesList();
  const teamMembers = useTeamMembers();

  const ownerMap = new Map(teamMembers.map(m => [m.id, m.display_name]));

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between border border-slate-700 rounded-lg px-4 py-2.5 bg-slate-800/50">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-white hover:text-slate-200 transition-colors">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Referral Sources
            <Badge variant="secondary" className="ml-1 text-xs bg-slate-700 text-slate-300">{sources.length}</Badge>
          </CollapsibleTrigger>
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(true)} className="gap-1.5 h-7 text-xs">
            <Plus className="h-3 w-3" /> Add Referral Source
          </Button>
        </div>

        <CollapsibleContent className="mt-2">
          <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/30">
            {sources.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No referral sources yet. Add your first one to start tracking.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs font-medium">Name</TableHead>
                    <TableHead className="text-slate-400 text-xs font-medium">Type</TableHead>
                    <TableHead className="text-slate-400 text-xs font-medium">Contact</TableHead>
                    <TableHead className="text-slate-400 text-xs font-medium text-center"># Referrals</TableHead>
                    <TableHead className="text-slate-400 text-xs font-medium">Owner</TableHead>
                    <TableHead className="text-slate-400 text-xs font-medium">Date Added</TableHead>
                    <TableHead className="text-slate-400 text-xs font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map(src => (
                    <TableRow
                      key={src.id}
                      className="border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                      onClick={() => setDetailSource(src)}
                    >
                      <TableCell className="text-sm text-white font-medium">
                        <div className="flex items-center gap-2">
                          {src.name}
                          {src.promoted_to_partner_id && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-600 text-emerald-400">
                              <Check className="h-2.5 w-2.5 mr-0.5" /> In Pipeline
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{src.type}</TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {src.contact_name || src.contact_email || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-300 text-center">{src.number_of_referrals}</TableCell>
                      <TableCell>
                        {src.relationship_owner_id ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" style={{ color: 'hsl(var(--primary))' }} />
                            <span className="text-xs" style={{ color: 'hsl(var(--primary))' }}>
                              {ownerMap.get(src.relationship_owner_id) || 'Unknown'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {format(new Date(src.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!src.promoted_to_partner_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300"
                              onClick={() => setPromoteSource(src)}
                            >
                              <ArrowRightCircle className="h-3 w-3" /> Add to Pipeline
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditSource(src)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-400"
                                onClick={() => {
                                  // Handled via delete in edit dialog
                                  setEditSource(src);
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AddReferralSourceDialog
        open={showAdd || !!editSource}
        onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditSource(null); } }}
        editSource={editSource}
      />

      {detailSource && (
        <ReferralSourceDetailModal
          source={detailSource}
          onClose={() => setDetailSource(null)}
          ownerMap={ownerMap}
        />
      )}

      {promoteSource && (
        <PromoteToPipelineDialog
          source={promoteSource}
          onClose={() => setPromoteSource(null)}
        />
      )}
    </>
  );
}
