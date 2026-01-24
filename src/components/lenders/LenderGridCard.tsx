import { memo, useMemo } from 'react';
import { Pencil, Trash2, Upload, Loader2, FileCheck, Megaphone, RefreshCw } from 'lucide-react';
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
import { LenderTileDisplaySettings } from '@/pages/LenderDatabaseConfig';

interface LenderSummary {
  hasNda: boolean;
  hasMarketingMaterials: boolean;
}

interface LenderGridCardProps {
  lender: MasterLender;
  activeDealCount: number;
  tileDisplaySettings: LenderTileDisplaySettings;
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

export const LenderGridCard = memo(function LenderGridCard({
  lender,
  activeDealCount,
  tileDisplaySettings,
  summary,
  isQuickUploading,
  quickUploadLenderName,
  onOpenDetail,
  onEdit,
  onDelete,
  onQuickUpload,
}: LenderGridCardProps) {
  // Memoize computed values
  const dealSizeRange = useMemo(() => {
    if (!lender.min_deal && !lender.max_deal) return null;
    return `${formatCurrency(lender.min_deal)} - ${formatCurrency(lender.max_deal)}`;
  }, [lender.min_deal, lender.max_deal]);

  const maxIndustries = tileDisplaySettings.maxIndustriesToShow;
  const topIndustries = useMemo(() => 
    lender.industries?.slice(0, maxIndustries) || [], 
    [lender.industries, maxIndustries]
  );
  const topLoanTypes = useMemo(() => 
    lender.loan_types?.slice(0, 2) || [], 
    [lender.loan_types]
  );

  const showFooter = tileDisplaySettings.showNdaStatus || tileDisplaySettings.showMarketingStatus;
  const isUploading = isQuickUploading && quickUploadLenderName === lender.name;

  return (
    <div
      className="relative bg-muted/50 rounded-lg p-3 flex flex-col transition-transform duration-200 hover:scale-105 cursor-pointer h-full min-h-[180px]"
      onClick={() => onOpenDetail(lender)}
    >
      {/* Top left corner badges */}
      <div className="absolute top-0 left-0 flex">
        {lender.tier && (
          <Badge 
            className={`text-xs rounded-tl-lg rounded-br-lg rounded-tr-none rounded-bl-none ${
              lender.tier === 'T1' ? 'bg-[#d1fae5] text-[#047857] hover:bg-[#d1fae5]' :
              lender.tier === 'T2' ? 'bg-[#d0e7ff] text-[#1d4ed8] hover:bg-[#d0e7ff]' :
              lender.tier === 'T3' ? 'bg-[#fef3c7] text-[#b45309] hover:bg-[#fef3c7]' :
              'bg-[#f3e8ff] text-[#7e22ce] hover:bg-[#f3e8ff]'
            }`}
          >
            {lender.tier}
          </Badge>
        )}
        {lender.flex_lender_id && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center justify-center bg-success/20 px-1.5 py-0.5 ${lender.tier || (tileDisplaySettings.showActiveDealCount && activeDealCount > 0) ? 'rounded-none rounded-br-lg' : 'rounded-tl-lg rounded-br-lg rounded-tr-none rounded-bl-none'}`}>
                <RefreshCw className="h-3 w-3 text-success" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Synced with FLEx</TooltipContent>
          </Tooltip>
        )}
        {tileDisplaySettings.showActiveDealCount && activeDealCount > 0 && (
          <Badge variant="default" className={`text-xs ${lender.tier || lender.flex_lender_id ? 'rounded-none rounded-br-lg' : 'rounded-tl-lg rounded-br-lg rounded-tr-none rounded-bl-none'}`}>
            {activeDealCount} active
          </Badge>
        )}
      </div>
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
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
          className="h-7 w-7"
          onClick={() => onEdit(lender.name)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
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
      
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center text-center mt-1">
        <p className="font-semibold text-base line-clamp-2 leading-tight">{lender.name}</p>
        
        {/* Lender type badge */}
        {tileDisplaySettings.showLenderType && lender.lender_type && (
          <Badge variant="outline" className="text-xs mt-1.5">
            {lender.lender_type}
          </Badge>
        )}
        
        {/* Lender type badge */}
        {tileDisplaySettings.showLenderType && lender.lender_type && (
          <Badge variant="outline" className="text-xs mt-1.5">
            {lender.lender_type}
          </Badge>
        )}
        
        {/* Deal range - prominent display */}
        {tileDisplaySettings.showDealRange && dealSizeRange && (
          <p className="text-sm font-medium text-primary mt-2">
            {dealSizeRange}
          </p>
        )}
        
        {/* Contact name */}
        {tileDisplaySettings.showContactName && lender.contact_name && (
          <p className="text-xs text-muted-foreground mt-1 truncate max-w-full">
            {lender.contact_name}
          </p>
        )}
        
        {/* Geography */}
        {tileDisplaySettings.showGeography && lender.geo && (
          <p className="text-xs text-muted-foreground mt-1 truncate max-w-full">
            📍 {lender.geo}
          </p>
        )}
        
        {/* Industries */}
        {tileDisplaySettings.showIndustries && topIndustries.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center mt-2">
            {topIndustries.map((industry, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {industry}
              </Badge>
            ))}
            {(lender.industries?.length || 0) > maxIndustries && (
              <Badge variant="outline" className="text-xs">
                +{(lender.industries?.length || 0) - maxIndustries}
              </Badge>
            )}
          </div>
        )}
        
        {/* Loan Types */}
        {tileDisplaySettings.showLoanTypes && topLoanTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center mt-2">
            {topLoanTypes.map((loanType, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {loanType}
              </Badge>
            ))}
            {(lender.loan_types?.length || 0) > 2 && (
              <Badge variant="outline" className="text-xs">
                +{(lender.loan_types?.length || 0) - 2}
              </Badge>
            )}
          </div>
        )}
      </div>
      
      {/* Footer with NDA/Marketing checkboxes */}
      {showFooter && (
        <div className="flex items-center justify-center gap-3 mt-2 pt-2 border-t border-border/50">
          {tileDisplaySettings.showNdaStatus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <Checkbox
                    checked={summary.hasNda}
                    disabled
                    className="h-3.5 w-3.5 data-[state=checked]:bg-success data-[state=checked]:border-success"
                  />
                  <span className="ml-1 text-xs text-muted-foreground">NDA</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {summary.hasNda ? 'NDA on file' : 'No NDA attached'}
              </TooltipContent>
            </Tooltip>
          )}
          {tileDisplaySettings.showMarketingStatus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <Checkbox
                    checked={summary.hasMarketingMaterials}
                    disabled
                    className="h-3.5 w-3.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <span className="ml-1 text-xs text-muted-foreground">Marketing</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {summary.hasMarketingMaterials ? 'Marketing materials on file' : 'No marketing materials attached'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
});
