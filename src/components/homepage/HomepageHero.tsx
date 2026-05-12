import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { SpinningGlobe } from "@/components/SpinningGlobe";
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
      const { error } = await supabase.functions.invoke("send-transactional-email", {
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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-transparent">
      {/* Globe — scaled down, pushed right. Screen blend so any internal dark fill disappears into the page gradient. */}
      <div
        className="absolute inset-0 flex items-center justify-end overflow-hidden pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      >
        <div className="w-[65%] h-full relative right-[-8%]">
          <SpinningGlobe />
        </div>
      </div>

      {/* Left-aligned, vertically centered content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="max-w-full md:max-w-[60%] lg:max-w-[50%] flex flex-col items-start gap-2">
          {/* Tagline — shares left edge with the "n" in the wordmark */}
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-[1.15] text-white">
            The Operating System for Deal Management
          </h1>

          {/* Supporting body copy */}
          <div className="mt-4 sm:mt-6 max-w-[42rem] flex flex-col gap-3 sm:gap-4 text-sm sm:text-base md:text-lg font-light leading-relaxed text-white/70">
            <p>
              We centralize deal execution into a single operating system — bringing work, decisions, and data together as deals move through review, diligence, and approval.
            </p>
            <p>
              Intelligence is embedded directly into execution, surfacing bottlenecks, highlighting risk, and keeping work moving without adding more tools or manual oversight.
            </p>
          </div>

          {/* Email capture form */}
          {submitted ? (
            <div
              role="status"
              className="mt-6 sm:mt-8 w-full max-w-[36rem] flex items-start gap-3 rounded-lg border border-white/15 bg-white/5 p-4 text-white"
            >
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-sm sm:text-base font-light leading-relaxed">
                Thanks — we've received your request and will be in touch shortly.
              </p>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 sm:mt-8 w-full max-w-[36rem] flex flex-col gap-3"
            aria-label="Book a demo"
          >
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
              <label htmlFor="hero-email" className="sr-only">
                Work email
              </label>
              <input
                id="hero-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
      placeholder="Enter your work email"
                disabled={isSubmitting}
                aria-invalid={!!errorMsg}
                onChange={(e) => { setEmail(e.target.value); if (errorMsg) setErrorMsg(null); }}
                className={`flex-1 min-w-0 h-12 px-4 rounded-lg bg-white/5 border text-white placeholder:text-white/40 text-sm sm:text-base outline-none transition-colors focus:bg-white/10 ${errorMsg ? "border-red-400/70 focus:border-red-400" : "border-white/15 focus:border-white/40"}`}
              />
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="marketing-glass-cta h-12 px-6 sm:px-8 text-sm sm:text-base font-semibold border-0 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
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
              <p role="alert" className="text-xs sm:text-sm text-red-300">
                {errorMsg}
              </p>
            )}
            <p className="text-xs leading-relaxed font-light text-white/40 max-w-[36rem]">
              By submitting this form, you consent to allow naitive to store and process the personal information submitted here to provide you with occasional updates and content that may interest you.
            </p>
          </form>
          )}
        </div>
      </div>
    </section>
  );
};
