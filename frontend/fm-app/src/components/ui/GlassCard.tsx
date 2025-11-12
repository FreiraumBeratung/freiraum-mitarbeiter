import { cn } from "../utils/cn";

export default function GlassCard({
  children,
  className,
}: {
  children: any;
  className?: string;
}) {
  return <div className={cn("fr-glass p-4 md:p-6", className)}>{children}</div>;
}


