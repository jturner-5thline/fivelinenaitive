import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";
import { ContactUsDialog } from "./ContactUsDialog";

export const HomepageHeader = () => {
  return (
    <div className="fixed top-3 sm:top-5 left-0 right-0 z-50 pointer-events-none px-3 sm:px-6">
      <header className="container max-w-6xl mx-auto rounded-[10px] pointer-events-auto bg-[rgba(8,10,18,0.72)] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.07] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_30px_-14px_rgba(0,0,0,0.55)]">
        <nav className="pl-2 pr-2 sm:pl-3 sm:pr-3 h-12 sm:h-14 flex items-center justify-between gap-4 leading-none">
          <Link to="/" className="flex items-center shrink-0 leading-none -ml-1" aria-label="naitive home">
            <img
              src={naitiveLogoDark}
              alt="naitive deal management logo"
              className="h-16 sm:h-24 md:h-28 lg:h-[7.5rem] w-auto object-contain block -my-5 sm:-my-8 md:-my-9 lg:-my-10"
              style={{ aspectRatio: 'auto' }}
            />
          </Link>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-white/75 hover:text-white hover:bg-white/[0.06] text-[13px] font-medium tracking-[-0.005em] px-3 sm:px-4 rounded-[8px]"
              asChild
            >
              <Link to="/login">Log in</Link>
            </Button>
            <ContactUsDialog>
              <Button
                size="sm"
                className="marketing-glass-cta h-9 border-0 text-[13px] font-semibold tracking-[-0.005em] px-4 sm:px-5 rounded-[8px]"
              >
                Contact Us
              </Button>
            </ContactUsDialog>
          </div>
        </nav>
      </header>
    </div>
  );
};
