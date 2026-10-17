import { useState } from "react";
import { HelpCircleIcon, Star, MessageSquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FeedbackButtonProps {
  showLabel?: boolean;
}

export function FeedbackButton({ showLabel = true }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [category, setCategory] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRating(0);
    setHover(0);
    setCategory("general");
    setMessage("");
  };

  const submit = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from("feedback").insert({
        user_id: userId,
        company_id: member?.company_id ?? null,
        rating: rating || null,
        category,
        message: message.trim(),
        status: "new",
        page_url: typeof window !== "undefined" ? window.location.pathname : null,
      } as never);
      if (error) throw error;
      toast.success("Thank you for your feedback!");
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error("Failed to submit: " + (e?.message ?? "unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SidebarMenuButton
        tooltip="Send feedback"
        onClick={() => setOpen(true)}
        className="hover:bg-sidebar-accent/50 cursor-pointer"
      >
        <HelpCircleIcon className="h-4 w-4" />
        {showLabel && <span>Feedback</span>}
      </SidebarMenuButton>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" />
              Send Feedback
            </DialogTitle>
            <DialogDescription>
              Help us improve naitive. Your feedback goes straight to the product team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      className={cn(
                        "h-6 w-6 transition-colors",
                        n <= (hover || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="What's working, what's not, what would you like to see..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting || !message.trim()}>
                {submitting ? "Sending..." : "Submit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}