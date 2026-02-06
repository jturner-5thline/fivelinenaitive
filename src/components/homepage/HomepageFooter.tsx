import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

const footerLinks = {
  product: [
    { label: "Features", href: "#" },
    { label: "Security", href: "#" },
    { label: "Integrations", href: "#" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

export const HomepageFooter = () => {
  return (
    <footer className="py-16 bg-[#0a0a12] border-t border-white/10">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/homepage" className="inline-block mb-4">
              <Logo className="h-16" />
            </Link>
            <p className="text-white/50 text-sm leading-relaxed mb-6 max-w-xs">
              The AI-powered deal management platform for transaction-advisory professionals and lenders.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4 text-white">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-white/50 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-white">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-white/50 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <p className="text-sm text-white/40">
              © {new Date().getFullYear()} naitive. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
