interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "text-xl" }: LogoProps) => {
  return (
    <span className={`font-semibold ${className}`}>
      <span className="text-foreground">n</span>
      <span className="text-brand">AI</span>
      <span className="text-foreground">tive</span>
    </span>
  );
};
