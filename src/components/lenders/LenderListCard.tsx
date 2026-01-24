import { memo, useMemo } from 'react';
import { Pencil, Trash2, Upload, Loader2, FileCheck, Megaphone, Building2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  summary: LenderSummary;
  isQuickUploading: boolean;
  quickUploadLenderName: string | null;
  onOpenDetail: (lender: MasterLender) => void;
  onEdit: (lenderName: string) => void;
  onDelete: (id: string, name: string) => void;
  onQuickUpload: (lenderName: string, category: 'nda' | 'marketing_materials') => void;
}

// Helper to format currency - moved outside component for stability
function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

export const LenderListCard = memo(function LenderListCard({
  lender,
  activeDealCount,
  summary,
  isQuickUploading,
  quickUploadLenderName,
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
      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
      onClick={() => onOpenDetail(lender)}
    >
      <div className="p-2 bg-primary/10 rounded-lg">
        <Building2 className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate">{lender.name}</h3>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <RefreshCw className="h-3.5 w-3.5 text-success" />
                </div>
              </TooltipTrigger>
              <TooltipContent>Synced with FLEx</TooltipContent>
            </Tooltip>
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
                This will remove the lender from the available options. This action cannot be undone.
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
