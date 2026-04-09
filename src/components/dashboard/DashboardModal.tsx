import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DashboardModal({ open, onOpenChange }: DashboardModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[88vh] max-h-[88vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Dashboard</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-4" />
      </DialogContent>
    </Dialog>
  );
}
