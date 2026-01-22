import { Helmet } from "react-helmet-async";
import { SpinningGlobe } from "@/components/SpinningGlobe";

const Promo = () => {
  return (
    <>
      <Helmet>
        <title>nAItive | Intelligence, by Design</title>
      </Helmet>
      
      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
        <SpinningGlobe />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-4 md:pb-6 px-4">
          <div className="absolute top-[-5%] left-1/2 -translate-x-1/2 pointer-events-none select-none flex flex-col items-center">
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
              className="text-white text-[2.16vw] font-light tracking-[0.85em] -mt-[5.5vw] uppercase whitespace-nowrap ml-[0.35em] opacity-0"
              style={{
                animation: 'fadeInTagline 0.3s ease-out 0.4s forwards',
              }}
            >
              Coming March 2026
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
        </div>
      </div>
    </>
  );
};

export default Promo;
