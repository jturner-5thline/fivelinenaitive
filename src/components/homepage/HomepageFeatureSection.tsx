import { ReactNode } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface HomepageFeatureSectionProps {
  title: string;
  description: string;
  image: ReactNode;
  reverse?: boolean;
}

export const HomepageFeatureSection = ({
  title,
  description,
  image,
  reverse = false,
}: HomepageFeatureSectionProps) => {
  const { ref: textRef, isVisible: textVisible } = useScrollReveal();
  const { ref: imageRef, isVisible: imageVisible } = useScrollReveal(0.1);

  return (
    <section className="py-14 md:py-20 bg-[#0a0a12]">
      <div className="container mx-auto px-6">
        <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 lg:gap-20 items-center`}>
          {/* Text */}
          <div
            ref={textRef}
            className={`flex-1 max-w-xl transition-all duration-700 delay-100 ${textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[hsl(270,65%,72%)] mb-4">
              Module
            </p>
            <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
              {title}
            </h3>
            <p className="text-lg text-white/60 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Image */}
          <div
            ref={imageRef}
            className={`flex-1 w-full transition-all duration-700 delay-200 ${imageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="relative">
              {/* halo */}
              <div className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,_hsl(270,70%,50%,0.18),_transparent_65%)] pointer-events-none" />
              <div className="relative rounded-2xl overflow-hidden bg-white/[0.04] border border-white/15 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_-20px_hsl(270,70%,30%,0.4)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(280,70%,65%,0.7)] to-transparent" />
                {image}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
