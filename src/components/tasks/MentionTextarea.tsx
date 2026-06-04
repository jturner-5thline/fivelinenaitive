import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useTeamMembers, TeamMember } from '@/hooks/useTeamMembers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}

type MentionRef = { name: string; id: string };

// Convert storage format "@[Name](uuid)" → display "@Name", collecting mention refs in order.
function storageToDisplay(storage: string): { display: string; refs: MentionRef[] } {
  const refs: MentionRef[] = [];
  const display = storage.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_m, name, id) => {
    refs.push({ name, id });
    return `@${name}`;
  });
  return { display, refs };
}

// Convert display "@Name" → storage "@[Name](uuid)" using the tracked refs (in insertion order).
// Each ref is consumed by replacing the first remaining occurrence of `@Name`.
function displayToStorage(display: string, refs: MentionRef[]): string {
  let out = display;
  let cursor = 0;
  for (const ref of refs) {
    const token = `@${ref.name}`;
    const idx = out.indexOf(token, cursor);
    if (idx < 0) continue; // user deleted the mention
    const replacement = `@[${ref.name}](${ref.id})`;
    out = out.slice(0, idx) + replacement + out.slice(idx + token.length);
    cursor = idx + replacement.length;
  }
  return out;
}

export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  minRows = 3,
}: MentionTextareaProps) {
  const members = useTeamMembers();
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Display value shown in the textarea (clean "@Name") and the mention refs we've tracked.
  const initial = storageToDisplay(value || '');
  const [displayValue, setDisplayValue] = useState(initial.display);
  const mentionsRef = useRef<MentionRef[]>(initial.refs);
  const lastEmittedRef = useRef<string>(value || '');

  // Re-sync from external value changes (e.g. parent reset after submit).
  useEffect(() => {
    if ((value || '') === lastEmittedRef.current) return;
    const parsed = storageToDisplay(value || '');
    setDisplayValue(parsed.display);
    mentionsRef.current = parsed.refs;
    lastEmittedRef.current = value || '';
  }, [value]);

  const filteredMembers = members.filter(m =>
    m.display_name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
    (m.email && m.email.toLowerCase().includes(mentionQuery.toLowerCase()))
  ).slice(0, 6);

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionQuery]);

  const emitChange = (nextDisplay: string) => {
    setDisplayValue(nextDisplay);
    const storage = displayToStorage(nextDisplay, mentionsRef.current);
    lastEmittedRef.current = storage;
    onChange(storage);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    emitChange(newValue);

    // Check if we're in a mention context
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // Only show dropdown if @ is at start or preceded by whitespace, and no space in query
      const charBeforeAt = atIndex > 0 ? newValue[atIndex - 1] : ' ';
      if ((charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) && !textAfterAt.includes(' ')) {
        setShowDropdown(true);
        setMentionQuery(textAfterAt);
        setMentionStart(atIndex);
        return;
      }
    }
    setShowDropdown(false);
  };

  const insertMention = (member: TeamMember) => {
    if (mentionStart < 0) return;
    const current = displayValue;
    const before = current.slice(0, mentionStart);
    const cursorPos = textareaRef.current?.selectionStart ?? current.length;
    const after = current.slice(cursorPos);
    const mentionText = `@${member.display_name} `;
    const newValue = before + mentionText + after;
    mentionsRef.current = [...mentionsRef.current, { name: member.display_name, id: member.id }];
    emitChange(newValue);
    setShowDropdown(false);
    setMentionQuery('');
    setMentionStart(-1);

    // Refocus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + mentionText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    // Normal Enter = submit (if no dropdown)
    if (e.key === 'Enter' && !e.shiftKey && !showDropdown && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay to allow click on dropdown
          setTimeout(() => setShowDropdown(false), 200);
        }}
        placeholder={placeholder}
        rows={minRows}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          className,
        )}
      />
      {showDropdown && filteredMembers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-1 w-[240px] bg-popover border border-border rounded-md shadow-lg z-50 py-1 max-h-[200px] overflow-auto"
        >
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-left',
                i === selectedIndex && 'bg-accent'
              )}
              onMouseDown={e => {
                e.preventDefault();
                insertMention(member);
              }}
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={member.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-primary text-primary-foreground">
                  {member.display_name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{member.display_name}</p>
                {member.email && (
                  <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render text with mentions highlighted */
export function MentionText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@\[([^\]]+)\]\(([^)]+)\))/g);
  // parts: [before, full_match, display_name, user_id, after, ...]
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < parts.length) {
    if (i + 3 < parts.length && parts[i + 1]?.startsWith('@[')) {
      elements.push(parts[i]); // text before
      elements.push(
        <span key={i} className="text-primary font-medium">
          @{parts[i + 2]}
        </span>
      );
      i += 4;
    } else {
      elements.push(parts[i]);
      i++;
    }
  }

  return <span className={className}>{elements}</span>;
}
