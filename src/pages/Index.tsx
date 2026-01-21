import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { RateLimitGuard } from "@/components/RateLimitGuard";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has access
    const hasAccess = sessionStorage.getItem('landing-access') === 'granted';
    if (!hasAccess) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return (
    <RateLimitGuard path="/home">
      <>
      <Helmet>
        <title>nAItive | Deal Analysis Platform</title>
        <meta 
          name="description" 
          content="AI-powered deal analysis platform for growth investors." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
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
        
        {/* Dark blue overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#010128]/95 via-[#010128]/90 to-[#010114]/95" />
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center">
            <h1 className="text-[18vw] font-sans font-bold tracking-tighter whitespace-nowrap animate-fade-in">
              <span className="text-white/[0.10]">n</span>
              <span 
                className="bg-clip-text text-transparent"
                style={{ 
                  backgroundImage: 'linear-gradient(45deg, rgba(100,116,139,0.3) 0%, rgba(139,92,246,0.45) 50%, rgba(148,163,184,0.3) 100%)',
                  backgroundSize: '300% 300%',
                  animation: 'shimmer 8s ease-in-out infinite',
                }}
              >AI</span>
              <span className="text-white/[0.10]">tive</span>
            </h1>
            <p 
              className="text-white text-[1.65vw] font-light tracking-[0.72em] -mt-[5.5vw] uppercase whitespace-nowrap ml-[0.35em] opacity-0"
              style={{
                animation: 'fadeInTagline 0.3s ease-out 0.4s forwards',
              }}
            >
              Intelligence, by Design
            </p>
          </div>
          <style>{`
            @keyframes shimmer {
              0%, 100% { background-position: 100% 100%; }
              50% { background-position: 0% 0%; }
            }
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
            variant="outline" 
            size="lg"
            className="bg-transparent border-white/20 text-white hover:bg-white/5 hover:border-white/40 hover:text-white px-8 py-6 text-base font-light tracking-wide"
            asChild
          >
            <Link to="/login">Login</Link>
          </Button>
        </div>
        
        {/* Learn More Button - Bottom Left */}
        <div className="fixed bottom-8 left-8 z-50">
          <Button 
            variant="outline" 
            size="sm"
            className="bg-transparent border-white/20 text-white hover:bg-white/5 hover:border-white/40 hover:text-white font-light tracking-wide"
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
