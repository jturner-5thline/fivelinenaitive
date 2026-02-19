import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MentionItem {
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export const MentionList = forwardRef<any, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command({ id: item.user_id, label: item.display_name || item.email });
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-2 text-sm text-muted-foreground">
        No members found
      </div>
    );
  }

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[200px]">
      {items.map((item, index) => (
        <button
          key={item.user_id}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
            index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          )}
          onClick={() => selectItem(index)}
        >
          {item.avatar_url ? (
            <img src={item.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
              {(item.first_name?.[0] || item.email[0]).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium">{item.display_name || item.email}</span>
            {item.display_name && (
              <span className="truncate text-xs text-muted-foreground">{item.email}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
