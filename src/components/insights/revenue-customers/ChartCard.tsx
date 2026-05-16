import { ReactNode, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, SlidersHorizontal, Download, Link as LinkIcon, EyeOff, LineChart as LineIcon, BarChart3, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  className?: string;
  /** col-span hint for lg breakpoint; default 6 (half-width on 12-col xl, half on 4-col lg) */
  span?: 1 | 2 | 3 | 4;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  onDownload?: () => void;
  onChangeChartType?: () => void;
  onCopyLink?: () => void;
  onHide?: () => void;
  onLocalFilter?: () => void;
  height?: number;
}

export function ChartCard({
  title, subtitle, legend, className, span = 2,
  loading, error, empty, emptyMessage = 'No data for the selected period.',
  children, onDownload, onChangeChartType, onCopyLink, onHide, onLocalFilter,
  height = 260,
}: ChartCardProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const spanClass =
    span === 1 ? 'lg:col-span-1' :
    span === 2 ? 'lg:col-span-2' :
    span === 3 ? 'lg:col-span-3' :
    'lg:col-span-4';

  return (
    <Card className={cn('flex flex-col', spanClass, className)}>
      <CardHeader className="p-4 pb-2 flex-row items-start gap-2 space-y-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight leading-tight truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {legend && <div className="text-[11px] text-muted-foreground flex items-center gap-2">{legend}</div>}
        {onLocalFilter && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onLocalFilter}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onChangeChartType && (
              <DropdownMenuItem onClick={onChangeChartType}>
                <BarChart3 className="h-3.5 w-3.5 mr-2" /> Change chart type
              </DropdownMenuItem>
            )}
            {onDownload && (
              <DropdownMenuItem onClick={onDownload}>
                <Download className="h-3.5 w-3.5 mr-2" /> Download CSV
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => {
              const url = window.location.href + `#${encodeURIComponent(title)}`;
              navigator.clipboard?.writeText(url);
              onCopyLink?.();
              toast.success('Link copied');
            }}>
              <LinkIcon className="h-3.5 w-3.5 mr-2" /> Copy link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setHidden(true); onHide?.(); }}>
              <EyeOff className="h-3.5 w-3.5 mr-2" /> Hide widget
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 flex-1 min-h-0">
        <div style={{ height }} className="w-full">
          {loading ? (
            <div className="h-full w-full flex flex-col gap-2 py-2">
              <Skeleton className="h-full w-full" />
            </div>
          ) : error ? (
            <div className="h-full w-full flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <p className="text-xs">{error}</p>
            </div>
          ) : empty ? (
            <div className="h-full w-full flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
              <LineIcon className="h-5 w-5 opacity-50" />
              <p className="text-xs">{emptyMessage}</p>
            </div>
          ) : children}
        </div>
      </CardContent>
    </Card>
  );
}