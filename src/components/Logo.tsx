import { useTheme } from "next-themes";
import naitiveLogo from "@/assets/naitive-logo.png";
import naitiveLogoDark from "@/assets/naitive-logo-dark.png";

interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "h-3" }: LogoProps) => {
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === "dark" ? naitiveLogoDark : naitiveLogo;

  return (
    <img 
      src={logoSrc} 
      alt="naitive" 
      className={className}
    />
  );
};
