import { memo, useMemo } from 'react';
import { Pencil, Trash2, Upload, Loader2, FileCheck, Megaphone, Building2 } from 'lucide-react';
import { LenderNotesPopover, LenderFlagIndicator } from '@/components/lenders/LenderNotesPopover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { MasterLender } from '@/hooks/useMasterLenders';

interface LenderSummary {
  hasNda: boolean;
  hasMarketingMaterials: boolean;
}

interface LenderListCardProps {
  lender: MasterLender;
  activeDealCount: number;
  duplicateCount?: number;
  duplicateSiblings?: { id: string; name: string }[];
  onOpenSiblingDetail?: (lenderId: string) => void;
  summary: LenderSummary;
  isQuickUploading: boolean;
  quickUploadLenderName: string | null;
  isSelected?: boolean;
  onToggleSelect?: (lenderId: string) => void;
  onOpenDetail: (lender: MasterLender) => void;
  onEdit: (lenderName: string) => void;
  onDelete: (id: string, name: string) => void;
  onQuickUpload: (lenderName: string, category: 'nda' | 'marketing_materials') => void;
  onToggleDocFlag?: (lenderName: string, field: 'nda' | 'marketing', value: boolean) => void;
}

// Helper to format currency - moved outside component for stability
import { formatLenderCurrency } from '@/utils/formatLenderCurrency';
const formatCurrency = (v: number | null | undefined) => formatLenderCurrency(v);

export const LenderListCard = memo(function LenderListCard({
  lender,
  activeDealCount,
  duplicateCount = 0,
  duplicateSiblings,
  onOpenSiblingDetail,
  summary,
  isQuickUploading,
  quickUploadLenderName,
  isSelected = false,
  onToggleSelect,
  onOpenDetail,
  onEdit,
  onDelete,
  onQuickUpload,
}: LenderListCardProps) {
  // Memoize computed values
  const dealSizeRange = useMemo(() => {
    if (!lender.min_deal && !lender.max_deal) return null;
    return `${formatCurrency(lender.min_deal)} - ${formatCurrency(lender.max_deal)}`;
  }, [lender.min_deal, lender.max_deal]);

  const displayTags = useMemo(() => [
    ...(lender.loan_types || []),
    ...(lender.industries || []),
  ], [lender.loan_types, lender.industries]);

  const isUploading = isQuickUploading && quickUploadLenderName === lender.name;

  return (
    <div 
      className={`deal-glass flex items-center gap-3 p-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => onOpenDetail(lender)}
    >
      {onToggleSelect && (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(lender.id)}
          />
        </div>
      )}
      <div className="p-2 bg-primary/10 rounded-lg">
        <Building2 className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate">{lender.name}</h3>
          <LenderFlagIndicator lenderName={lender.name} />
          {duplicateCount > 0 && (
            <Popover>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300 shrink-0 cursor-pointer hover:bg-amber-500/20"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {duplicateCount === 1 ? '1 possible dup' : `${duplicateCount} possible dups`}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-64 p-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Possible duplicates
                </div>
                <div className="max-h-64 overflow-auto">
                  {(duplicateSiblings ?? []).length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No sibling details available.
                    </div>
                  ) : (
                    (duplicateSiblings ?? []).map((sib) => (
                      <button
                        key={sib.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/60 truncate"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSiblingDetail?.(sib.id);
                        }}
                      >
                        {sib.name}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {lender.tier && (
            <Badge
              className={`text-xs shrink-0 ${
                lender.tier === 'T1' ? 'bg-[#d1fae5] text-[#047857] hover:bg-[#d1fae5]' :
                lender.tier === 'T2' ? 'bg-[#d0e7ff] text-[#1d4ed8] hover:bg-[#d0e7ff]' :
                lender.tier === 'T3' ? 'bg-[#fef3c7] text-[#b45309] hover:bg-[#fef3c7]' :
                'bg-[#f3e8ff] text-[#7e22ce] hover:bg-[#f3e8ff]'
              }`}
            >
              {lender.tier}
            </Badge>
          )}
          {lender.lender_type && (
            <Badge variant="outline" className="text-xs shrink-0">
              {lender.lender_type}
            </Badge>
          )}
          {/* NDA and Marketing status checkboxes */}
          {(() => {
            return (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Checkbox
                        checked={summary.hasNda}
                        disabled
                        className="h-4 w-4 data-[state=checked]:bg-success data-[state=checked]:border-success"
                      />
                      <span className="ml-1 text-xs text-muted-foreground">NDA</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {summary.hasNda ? 'NDA on file' : 'No NDA attached'}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Checkbox
                        checked={summary.hasMarketingMaterials}
                        disabled
                        className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <span className="ml-1 text-xs text-muted-foreground">Marketing</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {summary.hasMarketingMaterials ? 'Marketing materials on file' : 'No marketing materials attached'}
                  </TooltipContent>
                </Tooltip>
              </>
            );
          })()}
          {lender.flex_lender_id && (
            <Badge className="text-xs bg-[#d0e7ff] text-[#1d4ed8] hover:bg-[#d0e7ff]">
              FLEx
            </Badge>
          )}
          {activeDealCount > 0 && (
            <Badge variant="default" className="text-xs">
              {activeDealCount} active
            </Badge>
          )}
        </div>
        {/* Contact and deal size info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {lender.contact_name && (
            <span>{lender.contact_name}{lender.contact_title && ` (${lender.contact_title})`}</span>
          )}
          {lender.email && <span>{lender.email}</span>}
          {dealSizeRange && (
            <span className="font-medium text-foreground">Deal Size: {dealSizeRange}</span>
          )}
          {lender.min_revenue && (
            <span>Min Revenue: {formatCurrency(lender.min_revenue)}</span>
          )}
          {lender.geo && <span>📍 {lender.geo}</span>}
        </div>
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {displayTags.slice(0, 5).map((tag, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {displayTags.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{displayTags.length - 5} more
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
        <LenderNotesPopover lenderName={lender.name} masterLenderId={lender.id} side="left" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onQuickUpload(lender.name, 'nda')}>
              <FileCheck className="h-4 w-4 mr-2" />
              Upload NDA
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickUpload(lender.name, 'marketing_materials')}>
              <Megaphone className="h-4 w-4 mr-2" />
              Upload Marketing Materials
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(lender.name)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {lender.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the funding source from the available options. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(lender.id, lender.name)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
});
