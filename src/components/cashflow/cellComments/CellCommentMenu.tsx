import { useEffect, useRef } from 'react';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react';

interface CellCommentMenuProps {
  x: number;
  y: number;
  hasComments: boolean;
  onAdd: () => void;
  onView: () => void;
  onClose: () => void;
}

export function CellCommentMenu({ x, y, hasComments, onAdd, onView, onClose }: CellCommentMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.min(x, vw - 200);
  const top = Math.min(y, vh - 110);

  return (
    <div ref={ref} className="cc-menu" style={{ left, top }} role="menu">
      <button type="button" role="menuitem" className="cc-menu-item" onClick={onAdd}>
        <MessageSquarePlus size={13} />
        Add comment
      </button>
      {hasComments && (
        <button type="button" role="menuitem" className="cc-menu-item" onClick={onView}>
          <MessagesSquare size={13} />
          View comments
        </button>
      )}
    </div>
  );
}
