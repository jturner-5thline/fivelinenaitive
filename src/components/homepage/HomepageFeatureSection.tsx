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
    <section className="py-10 md:py-14 bg-[#0a0a12]">
      <div className="container mx-auto px-6">
        <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 lg:gap-16 items-center`}>
          {/* Text */}
          <div
            ref={textRef}
            className={`flex-1 max-w-xl transition-all duration-700 delay-100 ${textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
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
            <div className="relative rounded-2xl overflow-hidden bg-[radial-gradient(circle_at_bottom_right,_hsl(280,60%,45%,0.2)_0%,_hsl(270,80%,4%)_40%,_hsl(270,100%,2%)_100%)] border border-white/10 shadow-2xl">
              {image}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
