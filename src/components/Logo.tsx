import naitiveLogo from "@/assets/naitive-logo.png";

interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "h-8" }: LogoProps) => {
  return (
    <img 
      src={naitiveLogo} 
      alt="naitive" 
      className={className}
    />
  );
};
