interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "text-xl" }: LogoProps) => {
  return (
    <span className={`font-semibold ${className}`}>
      <span className="text-foreground">n</span>
      <span className="bg-brand-gradient bg-clip-text text-transparent">AI</span>
      <span className="text-foreground">tive</span>
    </span>
  );
};
