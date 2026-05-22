import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface UserRow {
  name: string;
  email: string;
  role: "Admin" | "Member" | "Read Only";
}

const ACCOUNT_TYPES = ["Pilot", "Demo", "Partner", "Client"] as const;
const TRIAL_PLANS = ["Starter Trial", "Pro Trial", "Full Access"] as const;
const ROLES: UserRow["role"][] = ["Admin", "Member", "Read Only"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateDemoAccessModal({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [accountType, setAccountType] = useState<typeof ACCOUNT_TYPES[number]>("Pilot");
  const [notes, setNotes] = useState("");
  const [users, setUsers] = useState<UserRow[]>([{ name: "", email: "", role: "Admin" }]);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | undefined>(undefined);
  const [trialPlan, setTrialPlan] = useState<typeof TRIAL_PLANS[number]>("Pro Trial");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  const reset = () => {
    setCompanyName("");
    setAccountType("Pilot");
    setNotes("");
    setUsers([{ name: "", email: "", role: "Admin" }]);
    setTrialEndsAt(undefined);
    setTrialPlan("Pro Trial");
    setSendWelcomeEmail(true);
  };

  const updateUser = (i: number, patch: Partial<UserRow>) => {
    setUsers((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  };
  const addUser = () => setUsers((prev) => [...prev, { name: "", email: "", role: "Member" }]);
  const removeUser = (i: number) =>
    setUsers((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const validate = (): string | null => {
    if (!companyName.trim()) return "Company name is required";
    if (users.length === 0) return "At least one user is required";
    for (const u of users) {
      if (!u.name.trim()) return "Every user needs a name";
      if (!/^\S+@\S+\.\S+$/.test(u.email.trim())) return `Invalid email: ${u.email || "(empty)"}`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-demo-access", {
        body: {
          companyName: companyName.trim(),
          accountType,
          notes: notes.trim() || null,
          trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
          trialPlan,
          sendWelcomeEmail,
          users: users.map((u) => ({
            name: u.name.trim(),
            email: u.email.trim().toLowerCase(),
            role: u.role,
          })),
        },
      });
      if (error) throw error;
      const results = (data?.results ?? []) as Array<{
        email?: string;
        ok?: boolean;
        invited?: boolean;
        reason?: string | null;
      }>;
      const sent = results.filter((r) => r.invited).length;
      const notSent = results.filter((r) => r.ok && !r.invited && sendWelcomeEmail);
      const userFailures = results.filter((r) => !r.ok);

      if (sent > 0) {
        toast.success(
          `Demo access created for ${companyName}. ${sent} invite${sent === 1 ? "" : "s"} sent.`,
        );
      } else {
        toast.success(`Demo access created for ${companyName}.`);
      }
      if (notSent.length) {
        for (const r of notSent) {
          toast.error(
            `Invite email failed for ${r.email}: ${r.reason || "unknown error"}. Use “Resend invites” on the company row.`,
            { duration: 8000 },
          );
        }
      }
      if (userFailures.length) {
        for (const r of userFailures) {
          toast.error(`User ${r.email}: ${r.reason || "failed"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      onOpenChange(false);
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Failed to create demo access");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Demo Access</DialogTitle>
          <DialogDescription>
            Provision a new pilot or demo company with user accounts and send invite emails.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section A — Company info */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company info</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="company-name">Company Name *</Label>
                <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Capital" />
              </div>
              <div className="space-y-1.5">
                <Label>Company Type</Label>
                <Select value={accountType} onValueChange={(v) => setAccountType(v as typeof ACCOUNT_TYPES[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Contacted via Michael Krall referral" rows={2} />
              </div>
            </div>
          </section>

          {/* Section B — Users */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">User accounts</h3>
              <Button type="button" variant="outline" size="sm" onClick={addUser}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Another User
              </Button>
            </div>
            <div className="space-y-3">
              {users.map((u, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1.2fr_1.5fr_1fr_auto] items-end p-3 rounded-md border border-border bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs">User Name *</Label>
                    <Input value={u.name} onChange={(e) => updateUser(i, { name: e.target.value })} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input type="email" value={u.email} onChange={(e) => updateUser(i, { email: e.target.value })} placeholder="jane@acme.com" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Select value={u.role} onValueChange={(v) => updateUser(i, { role: v as UserRow["role"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeUser(i)}
                    disabled={users.length === 1}
                    aria-label="Remove user"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {/* Section C — Access */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access settings</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Access Expiry</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !trialEndsAt && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {trialEndsAt ? format(trialEndsAt, "PPP") : <span>No expiry (default 14 days)</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={trialEndsAt} onSelect={setTrialEndsAt} initialFocus className={cn("p-3 pointer-events-auto")} />
                    {trialEndsAt && (
                      <div className="p-2 border-t">
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => setTrialEndsAt(undefined)}>Clear</Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Trial Plan</Label>
                <Select value={trialPlan} onValueChange={(v) => setTrialPlan(v as typeof TRIAL_PLANS[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIAL_PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div>
                  <Label className="text-sm">Send Welcome Email</Label>
                  <p className="text-xs text-muted-foreground">Email each user an invite link to set up their account.</p>
                </div>
                <Switch checked={sendWelcomeEmail} onCheckedChange={setSendWelcomeEmail} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create &amp; Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}