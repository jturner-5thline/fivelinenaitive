import { useState } from 'react';
import { Share2, Copy, Link2, Clock, X, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatRelativeTime } from './helpers';
import type { ShareLink } from '@/hooks/useDataRoomShareLinks';

interface ShareLinkManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: ShareLink[];
  onCreateLink: (opts: { label?: string; expiresAt?: string; maxUploads?: number; targetItems?: string[] }) => Promise<ShareLink | null>;
  onDeactivateLink: (id: string) => Promise<boolean>;
  onDeleteLink: (id: string) => Promise<boolean>;
}

export function ShareLinkManager({
  open, onOpenChange, links, onCreateLink, onDeactivateLink, onDeleteLink,
}: ShareLinkManagerProps) {
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await onCreateLink({ label: newLabel || 'External Upload Link' });
    setNewLabel('');
    setCreating(false);
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/upload/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            External Share Links
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Create new */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Link label (optional)..."
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="h-8 text-xs flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Button size="sm" className="h-8 gap-1" onClick={handleCreate} disabled={creating}>
              <Plus className="h-3 w-3" /> Create
            </Button>
          </div>

          <Separator />

          {/* Existing links */}
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2 pr-2">
              {links.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No share links yet</p>
              )}
              {links.map(link => (
                <div key={link.id} className="p-2 rounded-md border space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{link.label}</span>
                    <div className="flex items-center gap-1">
                      {link.is_active ? (
                        <Badge className="text-[9px] h-4 px-1 bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">Inactive</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    Created {formatRelativeTime(link.created_at)}
                    {link.uploads_used > 0 && <span>· {link.uploads_used} uploads</span>}
                    {link.expires_at && <span>· Expires {formatRelativeTime(link.expires_at)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => copyLink(link.token)}>
                      <Copy className="h-2.5 w-2.5" /> Copy Link
                    </Button>
                    {link.is_active && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-amber-600" onClick={() => onDeactivateLink(link.id)}>
                        Deactivate
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-destructive" onClick={() => onDeleteLink(link.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
