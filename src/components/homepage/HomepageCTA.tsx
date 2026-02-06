import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const HomepageCTA = () => {
  return (
    <section className="py-12 md:py-16 bg-gradient-to-b from-[#0a0a12] to-[#1a1a2e]">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Ready to close{" "}
            <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-[hsl(292,46%,72%)] to-white bg-clip-text text-transparent">
              more deals?
            </span>
          </h2>


          <div className="flex items-center justify-center">
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-white/90 px-8 py-6 text-base"
              asChild
            >
              <Link to="/waitlist">
                Join Waitlist
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
