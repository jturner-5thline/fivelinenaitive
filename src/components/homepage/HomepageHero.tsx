import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookDemoDialog } from "./BookDemoDialog";
import officeImage from "@/assets/homepage-office.jpg";

export const HomepageHero = () => (
  <section data-homepage-hero className="os-hero relative overflow-hidden flex items-center">
    <img src={officeImage} alt="" className="os-hero-image absolute inset-0 h-full w-full object-cover" />
    <div className="os-hero-shade absolute inset-0" />
    <div className="os-container relative z-10 w-full py-16">
      <h1 className="max-w-[800px] text-[36px] md:text-[52px] lg:text-[64px] leading-[1.06] mb-6">The Operating System for Deal Management</h1>
      <p className="os-hero-subhead max-w-[660px] text-lg md:text-xl leading-relaxed mb-8">Centralizing deal execution into a single operating system — bringing work, decisions, and data together as deals move through review, diligence, and approval.</p>
      <div className="flex items-center gap-3">
        <Button variant="outline" asChild className="os-secondary h-11 px-6"><a href="https://naitive.co/login" target="_blank" rel="noopener noreferrer">Log In</a></Button>
        <BookDemoDialog><Button className="os-primary h-11 px-6">Book a Demo<ArrowRight /></Button></BookDemoDialog>
      </div>
    </div>
  </section>
);
