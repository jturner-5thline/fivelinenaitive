import { ReactNode } from "react";

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
  return (
    <section className="py-16 md:py-24 bg-[#0a0a12]">
      <div className="container mx-auto px-6">
        <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 lg:gap-16 items-center`}>
          {/* Text */}
          <div className="flex-1 max-w-xl">
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
              {title}
            </h3>
            <p className="text-lg text-white/60 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Image */}
          <div className="flex-1 w-full">
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a2e] to-[#0a0a12] border border-white/10 shadow-2xl">
              {image}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
