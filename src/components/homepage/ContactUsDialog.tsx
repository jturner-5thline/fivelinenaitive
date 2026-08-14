import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

const contactSchema = z.object({
  firstName: z.string().trim().nonempty({ message: "First name is required" }).max(80),
  lastName: z.string().trim().nonempty({ message: "Last name is required" }).max(80),
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
  company: z.string().trim().max(120).optional().or(z.literal("")),
});

interface ContactUsDialogProps {
  children: React.ReactNode;
}

export const ContactUsDialog = ({ children }: ContactUsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setCompany("");
    setErrorMsg(null);
    setSubmitted(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = contactSchema.safeParse({ firstName, lastName, email, company });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }
    setIsSubmitting(true);
    try {
      const submittedAt = new Date().toISOString();
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "contact-us-request",
          recipientEmail: "support@naitive.co",
          idempotencyKey: `contact-us-${parsed.data.email}-${submittedAt}`,
          templateData: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            email: parsed.data.email,
            company: parsed.data.company || undefined,
            submittedAt,
          },
        },
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      console.error("Contact us submit failed", err);
      setErrorMsg("Something went wrong sending your message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact us</DialogTitle>
          <DialogDescription>
            Tell us a little about you and our team will reach out shortly.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Thanks — your message is on its way. We'll be in touch soon.
            </p>
            <Button className="w-full" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-first-name">First name</Label>
                <Input
                  id="contact-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={80}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-last-name">Last name</Label>
                <Input
                  id="contact-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={80}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-company">Company (optional)</Label>
              <Input
                id="contact-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                maxLength={120}
                autoComplete="organization"
              />
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Submit"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};