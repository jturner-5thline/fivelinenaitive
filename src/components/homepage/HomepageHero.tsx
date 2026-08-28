import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const HomepageHero = () => {
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("hero-work-email") ?? "";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (email) sessionStorage.setItem("hero-work-email", email);
  }, [email]);

  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    setErrorMsg(null);
    sessionStorage.setItem("hero-work-email", trimmed);
    setIsSubmitting(true);
    // Open HubSpot scheduler synchronously inside the click handler so popup
    // blockers don't intercept it. We then fire-and-forget the Supabase log.
    const hubspotUrl = `https://meetings.hubspot.com/florencia-fustinoni/round-robin-for-website-demo?email=${encodeURIComponent(trimmed)}`;
    window.open(hubspotUrl, "_blank", "noopener,noreferrer");
    try {
      const submittedAt = new Date().toISOString();
      const { error } = await supabase.functions.invoke("send-app-email", {
        body: {
          templateName: "demo-request",
          recipientEmail: "ppina@5thline.co",
          idempotencyKey: `demo-request-${trimmed}-${submittedAt}`,
          templateData: { workEmail: trimmed, submittedAt },
        },
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      console.error("Demo request submit failed", err);
      setErrorMsg("Something went wrong sending your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section data-homepage-hero className="relative min-h-screen flex items-center justify-center overflow-hidden bg-transparent">
      {/* Left-aligned, vertically centered content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="max-w-full md:max-w-[34rem] lg:max-w-[40rem] xl:max-w-[42rem] flex flex-col items-start">
          {/* Headline */}
          <h1 className="mt-10 sm:mt-14 md:mt-16 text-[30px] sm:text-[40px] md:text-[48px] lg:text-[56px] font-semibold tracking-[-0.025em] leading-[1.02] text-white max-w-[20ch]">
            The Operating System for Deal Management
          </h1>

          {/* Primary subhead — true subhead, brighter & shorter */}
          <p className="mt-7 sm:mt-8 max-w-[38rem] text-[19px] sm:text-[22px] md:text-[24px] font-light leading-[1.5] text-white/85">
            We centralize deal execution into a single operating system — bringing work, decisions, and data together as deals move through review, diligence, and approval.
          </p>

          {/* Email capture form */}
          {submitted ? (
            <div
              role="status"
              className="mt-12 sm:mt-14 w-full max-w-[32rem] flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-4 text-white"
            >
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-sm sm:text-base font-light leading-relaxed">
                Thanks — we've received your request and will be in touch shortly.
              </p>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-12 sm:mt-14 w-full max-w-[32rem] flex flex-col gap-0"
            aria-label="Book a demo"
          >
            <div className="group/form flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0 w-full sm:p-1 sm:rounded-[14px] sm:border sm:border-white/[0.09] sm:bg-[rgba(10,12,20,0.55)] sm:backdrop-blur-xl sm:backdrop-saturate-150 sm:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_12px_40px_-18px_rgba(0,0,0,0.75)] sm:focus-within:border-white/20 sm:transition-colors">
              <label htmlFor="hero-email" className="sr-only">
                Work email
              </label>
              <input
                id="hero-email"
                type="email"
                required
                value={email}
      placeholder="Enter your work email"
                disabled={isSubmitting}
                aria-invalid={!!errorMsg}
                onChange={(e) => { setEmail(e.target.value); if (errorMsg) setErrorMsg(null); }}
                className={`flex-1 min-w-0 h-12 sm:h-12 px-4 sm:px-5 rounded-xl sm:rounded-l-[10px] sm:rounded-r-none bg-white/[0.04] sm:bg-transparent border sm:border-0 text-white placeholder:text-white/40 text-[15px] tracking-[-0.005em] outline-none transition-colors focus:bg-white/[0.08] sm:focus:bg-transparent sm:focus:ring-0 ${errorMsg ? "border-red-400/70 focus:border-red-400" : "border-white/10 focus:border-white/30"}`}
              />
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="marketing-glass-cta h-12 sm:h-12 px-6 sm:px-6 rounded-xl sm:rounded-[10px] text-[14.5px] font-semibold tracking-[-0.005em] border-0 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Book a demo"
                )}
              </Button>
            </div>
            {errorMsg && (
              <p role="alert" className="mt-3 text-xs sm:text-sm text-red-300">
                {errorMsg}
              </p>
            )}
            <p className="mt-6 sm:mt-8 text-[11px] leading-[1.6] font-light text-white/30 max-w-[30rem]">
              By submitting this form, you consent to allow naitive to store and process the personal information submitted here to provide you with occasional updates and content that may interest you.
            </p>
          </form>
          )}
        </div>
      </div>
    </section>
  );
};
