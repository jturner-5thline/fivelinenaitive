import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

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
      
      <div className="min-h-screen bg-gradient-to-br from-[#1a1a4e] via-[#2d2d7a] to-[#3d2d6b] flex flex-col items-center justify-center">
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
    </>
  );
};

export default Index;
