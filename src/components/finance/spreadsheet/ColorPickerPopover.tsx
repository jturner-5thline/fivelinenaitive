import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  // Row 1 - basic
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  // Row 2 - reds/pinks
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  // Row 3 - pastels
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  // Row 4 - medium
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  // Row 5 - deep
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
  // Row 6 - dark
  '#A61C00', '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3C78D8', '#3D85C6', '#674EA7', '#A64D79',
];

interface ColorPickerPopoverProps {
  color?: string;
  onChange: (color: string) => void;
  children: React.ReactNode;
}

export function ColorPickerPopover({ color, onChange, children }: ColorPickerPopoverProps) {
  const [customColor, setCustomColor] = useState(color || '#000000');
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="start">
        <div className="space-y-3">
          <div className="grid grid-cols-10 gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={cn(
                  "w-5 h-5 rounded-sm border border-border/50 hover:ring-2 hover:ring-primary/50 transition-all",
                  color === c && "ring-2 ring-primary"
                )}
                style={{ backgroundColor: c }}
                onClick={() => { onChange(c); setOpen(false); }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: customColor }} />
            <Input
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="h-7 text-xs font-mono flex-1"
              placeholder="#RRGGBB"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={() => { onChange(customColor); setOpen(false); }}
            >
              Apply
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs w-full"
            onClick={() => { onChange(''); setOpen(false); }}
          >
            Clear color
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
