import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { cn } from '@/lib/utils';
import { LenderContactInsert } from '@/hooks/useLenderContacts';
import { LOCATION_OPTIONS } from '@/constants/locations';
import { US_STATE_OPTIONS } from '@/constants/usStates';
import { COUNTRY_OPTIONS } from '@/lib/countries';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    city: '',
    state: '',
    country: '',
  });

  // Live contact suggestions from the contacts database as the user types.
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const pickedRef = useRef(false);

  useEffect(() => {
    const q = form.name.trim();
    if (pickedRef.current) { pickedRef.current = false; return; }
    if (q.length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const esc = q.replace(/[%,()]/g, ' ').trim();
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, job_title, phone_mobile, phone_work')
        .or(`full_name.ilike.%${esc}%,first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%`)
        .limit(8);
      if (cancelled) return;
      setSuggestions(data || []);
      setShowSuggestions(true);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.name]);

  const pickContact = (c: any) => {
    pickedRef.current = true;
    setForm((prev) => ({
      ...prev,
      name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || prev.name,
      title: c.job_title || prev.title,
      email: c.email || prev.email,
      phone: c.phone_mobile || c.phone_work || prev.phone,
    }));
    setShowSuggestions(false);
    setSuggestions([]);
  };

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
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        country: form.country?.trim() || null,
      });
      
      if (result) {
        setForm({ name: '', title: '', email: '', phone: '', notes: '', geography: '', city: '', state: '', country: '' });
        setOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={true}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={disabled}>
          <Plus className="h-3 w-3" />
          Add Contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md !z-[1410]" overlayClassName="!z-[1400]">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <User className="h-3 w-3" />
              Name *
            </Label>
            <div className="relative">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Contact name"
                autoComplete="off"
                required
              />
              {showSuggestions && (suggestions.length > 0 || searching) && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-md border border-white/10 shadow-lg max-h-56 overflow-y-auto"
                  style={{ backgroundColor: 'hsl(var(--background))' }}
                >
                  {searching && suggestions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching contacts…</div>
                  ) : (
                    suggestions.map((c) => {
                      const nm = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickContact(c)}
                          className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <div className="text-sm text-foreground truncate">{nm}</div>
                          {(c.email || c.job_title) && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {[c.job_title, c.email].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
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
              <PopoverContent className="w-[300px] p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Search locations..."
                    value={geographySearch}
                    onChange={(e) => setGeographySearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto p-1">
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
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">City</Label>
            <Input
              value={form.city || ''}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="City"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">State</Label>
            <Select
              value={form.state || '__none__'}
              onValueChange={(v) => setForm({ ...form, state: v === '__none__' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent className="app-dropdown-surface lender-edit-popover max-h-64">
                <SelectItem value="__none__">None</SelectItem>
                {US_STATE_OPTIONS.map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select
              value={form.country || '__none__'}
              onValueChange={(v) => setForm({ ...form, country: v === '__none__' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent className="app-dropdown-surface lender-edit-popover max-h-64">
                <SelectItem value="__none__">None</SelectItem>
                {COUNTRY_OPTIONS.map((c: any) => {
                  const value = typeof c === 'string' ? c : (c.value ?? c.label);
                  const label = typeof c === 'string' ? c : (c.label ?? c.value);
                  return <SelectItem key={value} value={value}>{label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
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
