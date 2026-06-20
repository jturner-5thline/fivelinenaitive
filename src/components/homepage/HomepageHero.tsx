import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import heroBg from "@/assets/hero-bg-v2.png.asset.json";

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
      <div
        aria-hidden
        className="absolute inset-0 bg-no-repeat pointer-events-none"
        style={{
          backgroundImage: `url(${heroBg.url})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center bottom',
        }}
      />

      {/* Left-aligned, vertically centered content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="max-w-full md:max-w-[62%] lg:max-w-[52%] xl:max-w-[46rem] flex flex-col items-start">
          {/* Eyebrow */}
          <p className="text-[11px] sm:text-xs font-medium uppercase tracking-[0.22em] text-white/55">
            <span className="inline-block w-6 h-px align-middle bg-white/30 mr-3" />
            Deal execution platform
          </p>

          {/* Headline */}
          <h1 className="mt-5 sm:mt-6 text-[28px] sm:text-4xl md:text-5xl lg:text-[56px] font-semibold tracking-[-0.02em] leading-[1.05] text-white">
            The Operating System for Deal Management
          </h1>

          {/* Primary subhead */}
          <p className="mt-6 sm:mt-8 max-w-[38rem] text-base sm:text-lg md:text-xl font-light leading-[1.55] text-white/80">
            We centralize deal execution into a single operating system — bringing work, decisions, and data together as deals move through review, diligence, and approval.
          </p>

          {/* Secondary support copy */}
          <p className="mt-4 max-w-[36rem] text-sm sm:text-base font-light leading-[1.65] text-white/55">
            Intelligence is embedded directly into execution, surfacing bottlenecks, highlighting risk, and keeping work moving without adding more tools or manual oversight.
          </p>

          {/* Email capture form */}
          {submitted ? (
            <div
              role="status"
              className="mt-9 sm:mt-11 w-full max-w-[34rem] flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-4 text-white"
            >
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-sm sm:text-base font-light leading-relaxed">
                Thanks — we've received your request and will be in touch shortly.
              </p>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-9 sm:mt-11 w-full max-w-[34rem] flex flex-col gap-3"
            aria-label="Book a demo"
          >
            <div className="group/form flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1.5 w-full sm:p-1.5 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/[0.04] sm:backdrop-blur-md sm:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_30px_-14px_rgba(0,0,0,0.6)] sm:focus-within:border-white/25 sm:transition-colors">
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
                className={`flex-1 min-w-0 h-12 sm:h-11 px-4 rounded-xl sm:rounded-lg bg-white/[0.04] sm:bg-transparent border sm:border-0 text-white placeholder:text-white/40 text-sm sm:text-[15px] outline-none transition-colors focus:bg-white/[0.08] sm:focus:bg-transparent sm:focus:ring-0 ${errorMsg ? "border-red-400/70 focus:border-red-400" : "border-white/10 focus:border-white/30"}`}
              />
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="marketing-glass-cta h-12 sm:h-11 px-6 sm:px-7 rounded-xl sm:rounded-lg text-sm sm:text-[15px] font-semibold tracking-[-0.005em] border-0 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
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
            <p className="mt-1 text-[11px] sm:text-xs leading-[1.6] font-light text-white/35 max-w-[32rem]">
              By submitting this form, you consent to allow naitive to store and process the personal information submitted here to provide you with occasional updates and content that may interest you.
            </p>
          </form>
          )}
        </div>
      </div>
    </section>
  );
};
