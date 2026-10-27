import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { demoRequestSchema } from "./demoRequestSchema";

const emptyForm = { firstName: "", lastName: "", email: "", company: "", notes: "" };

export function BookDemoDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) { setForm(emptyForm); setSubmitted(false); setError(null); }
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    const parsed = demoRequestSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Please check your details."); return; }
    setSending(true);
    setError(null);
    try {
      const submittedAt = new Date().toISOString();
      const result = await supabase.functions.invoke("send-app-email", {
        body: {
          templateName: "contact-us-request",
          recipientEmail: "support@naitive.co",
          idempotencyKey: `demo-request-${parsed.data.email}-${submittedAt}`,
          templateData: { ...parsed.data, requestType: "demo", submittedAt },
        },
      });
      if (result.error) throw result.error;
      setSubmitted(true);
    } catch {
      setError("Your request could not be sent. Please try again.");
    } finally { setSending(false); }
  }
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>{children}</DialogTrigger>
    <DialogContent className="homepage-os homepage-demo-dialog rounded-lg max-w-[calc(100%-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-2xl">Book a Demo</DialogTitle>
        <DialogDescription>Tell us a little about your team. We’ll be in touch to arrange your demo.</DialogDescription>
      </DialogHeader>
      {submitted ? <div role="status" className="space-y-5 py-4">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p>Thanks — we’ve received your demo request and will be in touch shortly.</p>
        <Button onClick={() => changeOpen(false)} className="os-primary w-full">Close</Button>
      </div> : <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="demo-first">First Name</Label><Input id="demo-first" autoComplete="given-name" required maxLength={80} value={form.firstName} onChange={e => update("firstName", e.target.value)} disabled={sending} /></div>
          <div className="space-y-2"><Label htmlFor="demo-last">Last Name</Label><Input id="demo-last" autoComplete="family-name" required maxLength={80} value={form.lastName} onChange={e => update("lastName", e.target.value)} disabled={sending} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="demo-email">Work Email</Label><Input id="demo-email" type="email" autoComplete="email" required maxLength={255} value={form.email} onChange={e => update("email", e.target.value)} disabled={sending} /></div>
        <div className="space-y-2"><Label htmlFor="demo-company">Company (optional)</Label><Input id="demo-company" autoComplete="organization" maxLength={120} value={form.company} onChange={e => update("company", e.target.value)} disabled={sending} /></div>
        <div className="space-y-2"><Label htmlFor="demo-notes">Notes (optional)</Label><Textarea id="demo-notes" rows={3} maxLength={2000} value={form.notes} onChange={e => update("notes", e.target.value)} disabled={sending} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={sending} aria-busy={sending} className="os-primary h-11 w-full">{sending ? <><Loader2 className="animate-spin" />Sending…</> : <>Book a Demo<ArrowRight /></>}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}