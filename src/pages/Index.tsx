import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { RateLimitGuard } from "@/components/RateLimitGuard";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Safety net: if user already has an active session, send them to /deals
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/deals', { replace: true });
        return;
      }
      // Check if user has access to landing page
      const hasAccess = sessionStorage.getItem('landing-access') === 'granted';
      if (!hasAccess) {
        navigate('/', { replace: true });
      }
    };
    checkSession();
  }, [navigate]);

  return (
    <RateLimitGuard path="/home">
      <>
      <Helmet>
        <title>naitive | Deal Analysis Platform</title>
        <meta 
          name="description" 
          content="AI-powered deal analysis platform for growth investors." 
        />
      </Helmet>
      
      <div
        className="min-h-screen relative overflow-hidden"
        style={{ background: 'var(--app-backdrop)' }}
      >
        {/* YouTube Video Background */}
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <iframe
            src="https://www.youtube.com/embed/cR1FyHv_rJE?autoplay=1&mute=1&loop=1&playlist=cR1FyHv_rJE&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] min-w-full h-[56.25vw] min-h-full pointer-events-none"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="Background video"
          />
        </div>
        
        {/* Dark blue overlay — matches the app backdrop */}
        <div
          className="absolute inset-0"
          style={{ background: 'var(--app-backdrop)', opacity: 0.88 }}
        />
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center animate-fade-in mt-8">
            <Logo className="h-[18vw] max-h-48" />
            <p 
              className="text-white text-[1.65vw] font-light tracking-[0.72em] mt-4 uppercase whitespace-nowrap ml-[0.35em] opacity-0"
              style={{
                animation: 'fadeInTagline 0.3s ease-out 0.4s forwards',
              }}
            >
              Intelligence by Design
            </p>
          </div>
          <style>{`
            @keyframes fadeInTagline {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
          
          <Button 
            variant="liquid-glass" 
            size="lg"
            className="px-8 py-6 text-base font-light tracking-wide text-white"
            asChild
          >
            <Link to="/login">Login</Link>
          </Button>
        </div>
        
        {/* Learn More Button - Bottom Left */}
        <div className="fixed bottom-8 left-8 z-50">
          <Button 
            variant="liquid-glass" 
            size="sm"
            className="font-light tracking-wide text-white"
            asChild
          >
            <Link to="/homepage">Learn More</Link>
          </Button>
        </div>
      </div>
      </>
    </RateLimitGuard>
  );
};

export default Index;
