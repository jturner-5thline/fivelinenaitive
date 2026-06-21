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
    <section className="py-14 md:py-20 bg-transparent">
      <div className="container mx-auto px-6">
        <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 lg:gap-20 items-center`}>
          {/* Text */}
          <div
            ref={textRef}
            className={`flex-1 max-w-[34rem] transition-all duration-700 delay-100 ${textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <h3 className="text-3xl md:text-4xl lg:text-[40px] font-semibold tracking-[-0.02em] text-white mb-6 leading-[1.1]">
              {title}
            </h3>
            <p className="text-base md:text-lg font-light text-white/60 leading-[1.6]">
              {description}
            </p>
          </div>

          {/* Image */}
          <div
            ref={imageRef}
            className={`flex-1 w-full transition-all duration-700 delay-200 ${imageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[hsl(268,40%,16%,0.55)] to-[hsl(262,38%,9%,0.6)] border border-[hsl(220,15%,22%,0.9)] shadow-[inset_0_1px_0_hsl(220,15%,40%,0.12),0_1px_0_hsl(220,15%,8%,0.6),0_8px_24px_-12px_hsl(220,30%,2%,0.6)] backdrop-blur-2xl">
                {image}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
