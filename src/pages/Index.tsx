import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SpinningGlobe } from "@/components/SpinningGlobe";

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
        {/* Spinning Globe Background */}
        <SpinningGlobe />
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold text-white mb-4 tracking-tight">
            nAItive
          </h1>
          
          <p className="text-white/60 text-lg md:text-xl font-light mb-12 tracking-wide">
            AI-Powered Deal Intelligence
          </p>
          
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              size="lg"
              className="bg-transparent border-white/20 text-white hover:bg-white/5 hover:border-white/40 hover:text-white px-8 py-6 text-base font-light tracking-wide"
              asChild
            >
              <Link to="/login">Login</Link>
            </Button>
            
            <Button 
              variant="outline"
              size="lg"
              className="bg-transparent border-white/20 text-white hover:bg-white/5 hover:border-white/40 hover:text-white px-8 py-6 text-base font-light tracking-wide"
              asChild
            >
              <Link to="/deals">Deal Portal</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Index;
