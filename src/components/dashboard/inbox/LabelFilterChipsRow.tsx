// Row of clickable label filter chips, shown directly under the inbox
// category chips. Includes both user-defined labels (from email_labels) and
// system auto-tag labels (e.g. jturner@5thline.co). Selecting a chip filters
// the inbox to messages assigned that label or matching that auto-tag rule.
import { Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailLabel } from '@/hooks/useEmailLabels';
import { labelSwatch } from '@/components/deal/email/EmailLabelsManageDialog';

interface LabelFilterChipsRowProps {
  labels: EmailLabel[];
  selectedLabelId: string | null;
  onSelect: (id: string | null) => void;
}

export function LabelFilterChipsRow({
  labels,
  selectedLabelId,
  onSelect,
}: LabelFilterChipsRowProps) {
  if (!labels.length) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/30 overflow-x-auto">
      <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground shrink-0 mr-1">
        Labels
      </span>
      {labels.map((l) => {
        const swatch = labelSwatch(l.color);
        const isSelected = selectedLabelId === l.id;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onSelect(isSelected ? null : l.id)}
            title={l.description || l.name}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border shrink-0',
              isSelected
                ? 'border-foreground/40 bg-foreground/10 text-foreground'
                : 'border-border/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground',
            )}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: swatch }}
            />
            <span className="truncate max-w-[140px]">{l.name}</span>
            {isSelected && <X className="h-2.5 w-2.5" />}
          </button>
        );
      })}
    </div>
  );
}