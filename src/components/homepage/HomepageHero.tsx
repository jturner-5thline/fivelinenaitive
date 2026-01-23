import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import promoVideo from "@/assets/promo-video.mp4";

export const HomepageHero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a0a12]">
      {/* Video Background */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-40"
        >
          <source src={promoVideo} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a12]/60 via-transparent to-[#0a0a12]" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 text-center pt-20">
        {/* nAItive Brand */}
        <h2 className="text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8">
          <span className="text-white/20">n</span>
          <span 
            className="bg-clip-text text-transparent"
            style={{ 
              backgroundImage: 'linear-gradient(45deg, rgba(148,163,184,0.4) 0%, hsl(292, 46%, 72%) 50%, rgba(148,163,184,0.4) 100%)',
              backgroundSize: '300% 300%',
              animation: 'shimmer 8s ease-in-out infinite',
            }}
          >AI</span>
          <span className="text-white/20">tive</span>
        </h2>
        
        <style>{`
          @keyframes shimmer {
            0%, 100% { background-position: 100% 100%; }
            50% { background-position: 0% 0%; }
          }
        `}</style>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 max-w-4xl mx-auto leading-[1.1]">
          The AI Platform{" "}
          <br className="hidden md:block" />
          <span className="bg-gradient-to-r from-white via-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
            for Deal Professionals.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          Purpose-built AI that helps advisors and lenders work smarter, 
          move faster, and close more deals
        </p>

        <Button 
          size="lg" 
          className="bg-white text-primary hover:bg-white/90 px-8 py-6 text-base"
          asChild
        >
          <Link to="/login">Request a Demo</Link>
        </Button>
      </div>

      {/* Trusted by section */}
      <div className="absolute bottom-16 left-0 right-0 z-10">
        <div className="container mx-auto px-6">
          <p className="text-center text-white/40 text-sm mb-6">
            Trusted by leading financial institutions
          </p>
        </div>
      </div>
    </section>
  );
};
