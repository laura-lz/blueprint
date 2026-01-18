import * as React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline";
}

const Badge = ({ className, variant = "default", ...props }: BadgeProps) => (
  <div
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
      variant === "secondary" && "border-transparent bg-muted text-foreground",
      variant === "outline" && "text-muted-foreground",
      variant === "default" && "border-transparent bg-primary text-primary-foreground",
      className
    )}
    {...props}
  />
);
Badge.displayName = "Badge";

export { Badge };

