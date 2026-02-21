import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, DollarSign, Percent, PaintBucket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CellFormat, CellSelection, CellRange } from '@/hooks/useSpreadsheetWorkbook';

interface MiniToolbarProps {
  visible: boolean;
  position: { x: number; y: number };
  currentFormat: CellFormat;
  onFormatChange: (format: Partial<CellFormat>) => void;
}

export function MiniToolbar({ visible, position, currentFormat, onFormatChange }: MiniToolbarProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [visible]);

  if (!show) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-popover border rounded-lg shadow-lg px-1 py-0.5 flex items-center gap-0.5 animate-in fade-in-0 zoom-in-95"
      style={{
        left: position.x,
        top: position.y - 40,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <MiniBtn icon={Bold} active={currentFormat.bold} onClick={() => onFormatChange({ bold: !currentFormat.bold })} />
      <MiniBtn icon={Italic} active={currentFormat.italic} onClick={() => onFormatChange({ italic: !currentFormat.italic })} />
      <MiniBtn icon={Underline} active={currentFormat.underline} onClick={() => onFormatChange({ underline: !currentFormat.underline })} />
      <div className="w-px h-4 bg-border mx-0.5" />
      <MiniBtn icon={AlignLeft} active={currentFormat.align === 'left'} onClick={() => onFormatChange({ align: 'left' })} />
      <MiniBtn icon={AlignCenter} active={currentFormat.align === 'center'} onClick={() => onFormatChange({ align: 'center' })} />
      <MiniBtn icon={AlignRight} active={currentFormat.align === 'right'} onClick={() => onFormatChange({ align: 'right' })} />
      <div className="w-px h-4 bg-border mx-0.5" />
      <MiniBtn icon={DollarSign} active={currentFormat.numberFormat === '$#,##0.00'} onClick={() => onFormatChange({ numberFormat: '$#,##0.00' })} />
      <MiniBtn icon={Percent} active={currentFormat.numberFormat === '0.0%'} onClick={() => onFormatChange({ numberFormat: '0.0%' })} />
    </div>
  );
}

function MiniBtn({ icon: Icon, active, onClick }: { icon: React.ElementType; active?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-6 w-6 p-0 rounded-sm", active && "bg-accent text-accent-foreground")}
      onClick={onClick}
    >
      <Icon className="h-3 w-3" />
    </Button>
  );
}
