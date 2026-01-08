import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";


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
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 animate-fade-in">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold text-white mb-4 tracking-tight">
            nAItive
          </h1>
          
          <p className="text-white/60 text-lg md:text-xl font-light mb-12 tracking-wide">
            AI-Powered Deal Intelligence
          </p>
          
          <Button 
            variant="outline" 
            size="lg"
            className="bg-transparent border-white/20 text-white hover:bg-white/5 hover:border-white/40 hover:text-white px-8 py-6 text-base font-light tracking-wide"
            asChild
          >
            <Link to="/login">Login</Link>
          </Button>
        </div>
      </div>
    </>
  );
};

export default Index;
