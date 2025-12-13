interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "text-xl" }: LogoProps) => {
  return (
    <span className={`font-semibold ${className}`}>
      <span className="text-slate-700 dark:text-slate-300">n</span>
      <span className="text-purple-600 dark:text-purple-400">AI</span>
      <span className="text-slate-700 dark:text-slate-300">tive</span>
    </span>
  );
};
