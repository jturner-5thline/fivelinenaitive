import { Link } from "react-router-dom";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

export const HomepageFooter = () => (
  <footer className="border-t border-border py-6">
    <div className="os-container flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
      <Link to="/" aria-label="naitive home"><img src={naitiveLogoDark} alt="naitive" className="h-14 w-auto" /></Link>
      <p>© {new Date().getFullYear()} naitive. All rights reserved.</p>
      <div className="flex gap-5"><Link className="hover:text-foreground" to="/privacy">Privacy Policy</Link><Link className="hover:text-foreground" to="/terms">Terms of Service</Link></div>
    </div>
  </footer>
);
