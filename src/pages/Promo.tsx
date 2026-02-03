import { Helmet } from "react-helmet-async";
import { SpinningGlobe } from "@/components/SpinningGlobe";
import { Logo } from "@/components/Logo";

const Promo = () => {
  return (
    <>
      <Helmet>
        <title>naitive | Intelligence, by Design</title>
      </Helmet>
      
      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
        <SpinningGlobe />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-4 md:pb-6 px-4">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 pointer-events-none select-none flex flex-col items-center animate-fade-in">
            <Logo className="h-[18vw] max-h-48" />
            <p 
              className="text-white text-[2.16vw] font-light tracking-[0.85em] mt-4 uppercase whitespace-nowrap ml-[0.35em] opacity-0"
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
