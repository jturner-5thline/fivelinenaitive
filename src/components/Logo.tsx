import naitiveLogo from "@/assets/naitive-header-logo.png.asset.json";

interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "h-3" }: LogoProps) => {
  return (
    <img 
      src={naitiveLogo.url} 
      alt="naitive deal management logo" 
      className={`${className} w-auto shrink-0 object-contain`}
    />
  );
};
