import { useState, useMemo } from 'react';
import { Plus, User, Mail, Briefcase, Phone, FileText, MapPin, Check, ChevronsUpDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { LenderContactInsert } from '@/hooks/useLenderContacts';
import { LOCATION_OPTIONS } from '@/constants/locations';

interface AddLenderContactDialogProps {
  onAdd: (contact: LenderContactInsert) => Promise<any>;
  disabled?: boolean;
}

export function AddLenderContactDialog({ onAdd, disabled }: AddLenderContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geographyOpen, setGeographyOpen] = useState(false);
  const [geographySearch, setGeographySearch] = useState('');
  const [form, setForm] = useState<LenderContactInsert>({
    name: '',
    title: '',
    email: '',
    phone: '',
    notes: '',
    geography: '',
  });

  const filteredLocations = useMemo(() => {
    if (!geographySearch) return LOCATION_OPTIONS;
    const search = geographySearch.toLowerCase();
    return LOCATION_OPTIONS.filter(loc => loc.toLowerCase().includes(search));
  }, [geographySearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.name.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await onAdd({
        name: form.name.trim(),
        title: form.title?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        notes: form.notes?.trim() || null,
        geography: form.geography?.trim() || null,
      });
      
      if (result) {
        setForm({ name: '', title: '', email: '', phone: '', notes: '', geography: '' });
        setOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={disabled}>
          <Plus className="h-3 w-3" />
          Add Contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <User className="h-3 w-3" />
              Name *
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Contact name"
              required
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" />
              Title
            </Label>
            <Input
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Managing Director"
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              Email
            </Label>
            <Input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              Phone
            </Label>
            <Input
              type="tel"
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Geography
            </Label>
            <Popover open={geographyOpen} onOpenChange={setGeographyOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={geographyOpen}
                  className="w-full justify-between font-normal"
                >
                  {form.geography || "Select geography"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Search locations..."
                    value={geographySearch}
                    onChange={(e) => setGeographySearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <ScrollArea className="h-[200px]">
                  <div className="p-1">
                    {filteredLocations.length === 0 ? (
                      <div className="py-2 px-3 text-sm text-muted-foreground">No locations found</div>
                    ) : (
                      filteredLocations.map(option => (
                        <div
                          key={option}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm hover:bg-accent",
                            form.geography === option && "bg-accent"
                          )}
                          onClick={() => {
                            setForm({ ...form, geography: option });
                            setGeographyOpen(false);
                            setGeographySearch('');
                          }}
                        >
                          <Check className={cn("h-4 w-4", form.geography === option ? "opacity-100" : "opacity-0")} />
                          {option}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Notes
            </Label>
            <Textarea
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes about this contact..."
              rows={2}
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim() || isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
