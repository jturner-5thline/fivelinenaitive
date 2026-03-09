import { useState, useEffect } from 'react';
import { useSalesModelStore } from './useSalesModelStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export function AddMemberModal() {
  const { addMemberOpen, setAddMemberOpen, addMember } = useSalesModelStore();
  const [name, setName] = useState('');
  const [includeInTeam, setIncludeInTeam] = useState(true);

  useEffect(() => {
    if (addMemberOpen) { setName(''); setIncludeInTeam(true); }
  }, [addMemberOpen]);

  const handleAdd = () => {
    if (name.trim()) {
      addMember(name.trim(), includeInTeam);
    }
  };

  return (
    <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
      <DialogContent className="sm:max-w-md" style={{ background: '#1e2230', border: '1px solid rgba(255,255,255,0.1)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#e2e8f0' }}>Add Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Input
              placeholder="e.g. Alex"
              maxLength={20}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="border-white/10 bg-white/5"
              style={{ color: '#e2e8f0' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-team"
              checked={includeInTeam}
              onCheckedChange={v => setIncludeInTeam(v === true)}
            />
            <label htmlFor="include-team" className="text-sm" style={{ color: '#94a3b8' }}>
              Include in TEAM totals
            </label>
          </div>
          <p className="text-xs" style={{ color: '#64748b' }}>New member starts with blank data.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddMemberOpen(false)} className="border-white/10" style={{ color: '#94a3b8' }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!name.trim()} style={{ background: '#0d9488', color: '#fff' }}>
              Add Member
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
