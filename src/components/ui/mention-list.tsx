import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface MentionUser {
  id: string;
  display_name: string;
  avatar_url?: string | null;
}

interface MentionListProps {
  items: MentionUser[];
  command: (item: { id: string; label: string }) => void;
}

export const MentionList = forwardRef<any, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command({ id: item.id, label: item.display_name });
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

  if (items.length === 0) {
    return (
      <div className="bg-popover border border-border rounded-md shadow-md p-2 text-sm text-muted-foreground">
        No team members found
      </div>
    );
  }

  return (
    <div className="bg-popover border border-border rounded-md shadow-md overflow-hidden max-h-48 overflow-y-auto">
      {items.map((item, index) => {
        const initials = item.display_name
          ?.split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || '?';

        return (
          <button
            key={item.id}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
              index === selectedIndex && 'bg-accent'
            )}
            onClick={() => selectItem(index)}
          >
            <Avatar className="h-5 w-5">
              <AvatarImage src={item.avatar_url || undefined} />
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-foreground">{item.display_name}</span>
          </button>
        );
      })}
    </div>
  );
});

MentionList.displayName = 'MentionList';
