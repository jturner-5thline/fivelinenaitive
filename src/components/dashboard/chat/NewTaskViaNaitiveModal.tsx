import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NaitiveTaskComposer } from './NaitiveTaskComposer';
import type { ParseContext } from '@/hooks/useNaitiveTaskParse';

interface Props {
  context?: ParseContext;
}

/**
 * Mounts a global ⌘/Ctrl+Shift+T listener and renders a small modal
 * containing the same NaitiveTaskComposer used in the hero.
 */
export function NewTaskViaNaitiveModal({ context }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New task via naitive</DialogTitle>
          <DialogDescription>
            Type what you want to do — naitive will resolve the deal, owner, due date, and priority.
          </DialogDescription>
        </DialogHeader>
        <NaitiveTaskComposer
          context={context}
          autoFocus
          onCreated={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}