import { useState } from 'react';
import { Plus, X, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import type { NewsChannel } from '@/hooks/useNewsChannels';

interface ChannelManagerProps {
  channels: NewsChannel[];
  onCreateChannel: (channel: Omit<NewsChannel, 'id' | 'position' | 'is_active'>) => Promise<any>;
  onUpdateChannel: (id: string, updates: Partial<NewsChannel>) => Promise<void>;
  onDeleteChannel: (id: string) => Promise<void>;
}

export function ChannelManager({ channels, onCreateChannel, onUpdateChannel, onDeleteChannel }: ChannelManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState('');
  const [sources, setSources] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await onCreateChannel({ name: name.trim(), keywords, sources, color: 'bg-primary' });
    setName('');
    setKeywords([]);
    setSources([]);
    setIsOpen(false);
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords(prev => [...prev, keywordInput.trim()]);
      setKeywordInput('');
    }
  };

  const addSource = () => {
    if (sourceInput.trim() && !sources.includes(sourceInput.trim())) {
      setSources(prev => [...prev, sourceInput.trim()]);
      setSourceInput('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Custom Channels</h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              New Channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Custom Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Channel Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., SBA Lending" className="mt-1" />
              </div>
              <div>
                <Label>Keywords</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={keywordInput}
                    onChange={e => setKeywordInput(e.target.value)}
                    placeholder="Add a keyword..."
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                  />
                  <Button variant="outline" size="sm" onClick={addKeyword}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keywords.map(k => (
                    <Badge key={k} variant="secondary" className="gap-1 text-xs">
                      {k}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setKeywords(prev => prev.filter(x => x !== k))} />
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Sources (optional)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={sourceInput}
                    onChange={e => setSourceInput(e.target.value)}
                    placeholder="e.g., Bloomberg"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSource())}
                  />
                  <Button variant="outline" size="sm" onClick={addSource}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {sources.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1 text-xs">
                      {s}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setSources(prev => prev.filter(x => x !== s))} />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!name.trim()}>Create Channel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {channels.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom channels yet. Create one to filter news by your topics.</p>
      ) : (
        <div className="space-y-2">
          {channels.map(channel => (
            <Card key={channel.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{channel.name}</span>
                    <Switch
                      checked={channel.is_active}
                      onCheckedChange={(checked) => onUpdateChannel(channel.id, { is_active: checked })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {channel.keywords.map(k => (
                      <Badge key={k} variant="outline" className="text-[10px] px-1.5 py-0">{k}</Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteChannel(channel.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
