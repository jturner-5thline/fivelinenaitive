import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SpinningGlobe } from "@/components/SpinningGlobe";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>nAItive | Deal Analysis Platform</title>
        <meta 
          name="description" 
          content="AI-powered deal analysis platform for growth investors." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a1a3a] to-[#2a1a4a] relative overflow-hidden">
        {/* Spinning Globe Background */}
        <SpinningGlobe />
        
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/50" />
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center">
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-12 tracking-tight">
            nAItive
          </h1>
          
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              size="lg"
              className="bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white px-8"
              asChild
            >
              <Link to="/login">Login</Link>
            </Button>
            
            <Button 
              size="lg"
              className="bg-white text-[#2d2d7a] hover:bg-white/90 px-8"
              asChild
            >
              <Link to="/dashboard">Deal Portal</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Index;
